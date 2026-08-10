// ===================================================
// PLANILLA VENDEDORES - Sistema de Reservas
// ===================================================

const HORA_CORTE = 18;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Bari Usados')
    .addItem('Solicitar Reserva', 'requestReservation')
    .addItem('Liberar Reserva', 'releaseReservation')
    .addToUi();
}

function getHeadersMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    if (h) map[h.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, '_')] = i + 1;
  });
  return map;
}

function calculateExpirationDate() {
  let date = new Date();
  let addedDays = 0;
  while (addedDays < 2) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) addedDays++;
  }
  date.setHours(HORA_CORTE, 0, 0, 0);
  return date;
}

// ===================================================
// N8N WEBHOOK URL
// ===================================================
const N8N_WEBHOOK_URL = 'https://bipolos.app.n8n.cloud/webhook/reservasBari';

function requestReservation() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row <= 1) return ui.alert('⚠️ Seleccioná la fila de un auto primero.');

  const localHeaders = getHeadersMap(sheet);
  
  if (!localHeaders['dominio']) return ui.alert('❌ Error: No se encontró la columna Dominio en la planilla de vendedores.');

  const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dominio = rowData[localHeaders['dominio'] - 1]; 
  const marca = localHeaders['marca'] ? rowData[localHeaders['marca'] - 1] : '';
  const modelo = localHeaders['modelo'] ? rowData[localHeaders['modelo'] - 1] : '';

  let currentUserEmail = Session.getActiveUser().getEmail();
  
  if (!currentUserEmail) {
    const userPrompt = ui.prompt('Identificación', 'Ingresá tu nombre o tu email para registrar la reserva a tu nombre:', ui.ButtonSet.OK_CANCEL);
    if (userPrompt.getSelectedButton() !== ui.Button.OK) return;
    currentUserEmail = userPrompt.getResponseText().trim();
    
    if (!currentUserEmail) return ui.alert('⚠️ Tenés que ingresar un nombre para poder reservar.');
  }
  if (!dominio) return ui.alert('⚠️ Esta fila no tiene un Dominio válido.');

  // Leer estado actual de la reserva desde la hoja local
  const vendedorActual = localHeaders['vendedor_reserva'] ? rowData[localHeaders['vendedor_reserva'] - 1] : '';
  const estaReservado = vendedorActual && vendedorActual.toString().trim() !== '';

  if (estaReservado) {
    if (vendedorActual === currentUserEmail) {
      return ui.alert('⚠️ Ya sos el titular de la reserva actual de este vehículo.');
    }
    const resp = ui.alert('Vehículo Reservado', `Este auto ya fue reservado por ${vendedorActual}.\n\n¿Querés anotarte en la COLA DE ESPERA? Te avisaremos automáticamente si la venta se cae.`, ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return;
  }

  // Pedir nombre del cliente (para ambas acciones)
  const clientPrompt = ui.prompt('Datos del Cliente', 'Por favor, ingresá el Apellido y Nombre de tu cliente:', ui.ButtonSet.OK_CANCEL);
  if (clientPrompt.getSelectedButton() !== ui.Button.OK) return;
  const nombreCliente = clientPrompt.getResponseText().trim();
  if (!nombreCliente) return ui.alert('⚠️ El nombre del cliente es obligatorio.');

  const action = estaReservado ? 'ENCOLAR' : 'RESERVAR';
  const expiryDate = calculateExpirationDate();

  try {
    const payload = {
      action: action,
      dominio: dominio.toString().trim(),
      vendedor: currentUserEmail,
      cliente: nombreCliente,
      vencimiento: action === 'RESERVAR' ? expiryDate.toISOString() : null, // Solo se manda si es reserva directa
      marca: marca,
      modelo: modelo
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };

    // Llamada a n8n
    UrlFetchApp.fetch(N8N_WEBHOOK_URL, options);

    if (action === 'RESERVAR') {
      ui.alert('✅ ¡Éxito!', `El vehículo ha sido RESERVADO a tu nombre.\n\nVence el: ${expiryDate.toLocaleString()}\nSe ha notificado al equipo.\n\nNota: Puede demorar unos minutos en reflejarse visualmente en la planilla.`, ui.ButtonSet.OK);
    } else {
      ui.alert('📝 En Cola', `Estás en la cola de espera para este vehículo.\n\nSi ${vendedorActual} libera la reserva, el sistema te lo asignará a vos automáticamente.`, ui.ButtonSet.OK);
    }

  } catch (e) {
    ui.alert(`❌ Error de conexión con n8n: ${e.message}`);
  }
}

function releaseReservation() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row <= 1) return ui.alert('⚠️ Seleccioná la fila de un auto primero.');

  let currentUserEmail = Session.getActiveUser().getEmail();
  
  if (!currentUserEmail) {
    const userPrompt = ui.prompt('Identificación', 'Ingresá tu nombre o email de vendedor para confirmar la liberación:', ui.ButtonSet.OK_CANCEL);
    if (userPrompt.getSelectedButton() !== ui.Button.OK) return;
    currentUserEmail = userPrompt.getResponseText().trim();
    if (!currentUserEmail) return;
  }

  const localHeaders = getHeadersMap(sheet);
  if (!localHeaders['dominio']) return ui.alert('❌ Error: No se encontró la columna Dominio en la planilla.');

  const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dominio = rowData[localHeaders['dominio'] - 1];
  const vendedorActual = localHeaders['vendedor_reserva'] ? rowData[localHeaders['vendedor_reserva'] - 1] : '';
  const marca = localHeaders['marca'] ? rowData[localHeaders['marca'] - 1] : '';
  const modelo = localHeaders['modelo'] ? rowData[localHeaders['modelo'] - 1] : '';

  if (!dominio) return ui.alert('⚠️ Esta fila no tiene un Dominio válido.');
  if (!vendedorActual || vendedorActual.toString().trim() === '') {
    return ui.alert('⚠️ Este vehículo NO está reservado actualmente.');
  }

  // Verificar que el usuario que intenta liberar sea el titular
  if (vendedorActual !== currentUserEmail) {
    return ui.alert('❌ Solo el vendedor titular de la reserva puede liberarla manualmente.');
  }

  const resp = ui.alert('Confirmar Liberación', `¿Estás seguro de que querés liberar la reserva de ${dominio}?\n\nSi hay alguien en la cola de espera, se le asignará automáticamente.`, ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  try {
    const payload = {
      action: 'LIBERAR',
      dominio: dominio.toString().trim(),
      vendedor: currentUserEmail,
      marca: marca,
      modelo: modelo,
      nueva_fecha_cola: calculateExpirationDate().toISOString()
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };

    // Llamada a n8n
    UrlFetchApp.fetch(N8N_WEBHOOK_URL, options);

    ui.alert('✅ ¡Petición enviada con éxito!\nSe está procesando la liberación en segundo plano. Puede demorar unos minutos en verse reflejado en tu pantalla.');

  } catch (e) {
    ui.alert(`❌ Error de conexión con n8n: ${e.message}`);
  }
}
