// ===================================================
// PLANILLA VENDEDORES - Sistema de Reservas
// ===================================================

const MASTER_SPREADSHEET_ID = '1HPh4fpzM5b7PlpG3RnH6tYhTcWqfs7SFfIf3-klrxnI';
const HORA_CORTE = 18;
// Podes agregar más correos separandolos por comas
const EMAILS_NOTIFICACION_VENTAS = ['melisa.millan.mm@gmail.com', 'hugo.zorra@bari-mercedesbenz.com.ar', 'mariano.boberi@bari-mercedesbenz.com.ar', 'dario.lopez@bari-mercedesbenz.com.ar', 'mario.mapelli@bari-mercedesbenz.com.ar', 'carolina.bardon@bari-mercedesbenz.com.ar', 'marcela.fegan@bari-mercedesbenz.com.ar', 'juan_pablo.krvavica@bari-mercedesbenz.com.ar', 'natalia.alfaro@bari-mercedesbenz.com.ar', 'sofia.ferrari@bari-mercedesbenz.com.ar', 'florencia.schiaratura@bari-mercedesbenz.com.ar', 'jls@bari-mercedesbenz.com.ar', 'luciano.schiaratura@bari-mercedesbenz.com.ar', 'carlos.acosta@bari-mercedesbenz.com.ar', 'carlos.gomez@bari-mercedesbenz.com.ar', 'nicolas.llahi@bari-mercedesbenz.com.ar', 'rodrigo.garcia@bari-mercedesbenz.com.ar', 'florencio.calvo@bari-mercedesbenz.com.ar', 'juan_cruz.montaner@bari-mercedesbenz.com.ar', 'fabriprieto@hotmail.com', 'hugodisantoro@gmail.com','juan.ignacio.velazquez@bari-mercedesbenz.com.ar', 'osvaldo.castellano@bari-mercedesbenz.com.ar', 'constanza.romero@bari-mercedesbenz.com.ar', 'alejandro.picazo@bari-mercedesbenz.com.ar', 'marcelo.rotonda@bari-mercedesbenz.com.ar', 'luciano.valerga@bari-mercedesbenz.com.ar', 'cristian.dumerauf@bari-mercedesbenz.com.ar', 'carlos.dambolena@bari-mercedesbenz.com.ar'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚗 Bari Ventas')
    .addItem('🕒 Solicitar Reserva', 'requestReservation')
    .addItem('🔓 Liberar Reserva', 'releaseReservation')
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

function requestReservation() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row <= 1) return ui.alert('⚠️ Seleccioná la fila de un auto.');

  const localHeaders = getHeadersMap(sheet);
  const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const dominioIdx = localHeaders['dominio'];
  if (!dominioIdx) return ui.alert('❌ No se encontró la columna "Dominio".');

  const dominio = rowData[dominioIdx - 1];
  const marca = localHeaders['marca'] ? rowData[localHeaders['marca']-1] : '';
  const modelo = localHeaders['modelo'] ? rowData[localHeaders['modelo']-1] : '';
  const sucursal = localHeaders['sucursal'] ? rowData[localHeaders['sucursal']-1] : '';
  
  let currentUserEmail = Session.getActiveUser().getEmail();
  
  // Si Google bloqueó el email, se lo pedimos manualmente al vendedor
  if (!currentUserEmail || currentUserEmail.trim() === "") {
    const userPrompt = ui.prompt('Identificación', 'Ingresá tu nombre o tu email para registrar la reserva a tu nombre:', ui.ButtonSet.OK_CANCEL);
    if (userPrompt.getSelectedButton() !== ui.Button.OK) return;
    currentUserEmail = userPrompt.getResponseText().trim();
    
    if (!currentUserEmail) return ui.alert('⚠️ Tenés que ingresar un nombre para poder reservar.');
  }
  if (!dominio) return ui.alert('⚠️ Esta fila no tiene un Dominio válido.');

  try {
    // 1. Ir a buscar el estado REAL a la Master (evita bugs si la planilla local está desactualizada)
    const master = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    const masterSheet = master.getSheetByName('Stock'); 
    const masterHeaders = getHeadersMap(masterSheet);
    
    const dominiosValues = masterSheet.getRange(2, masterHeaders['dominio'], masterSheet.getLastRow() - 1, 1).getValues();
    const masterRowIdx = dominiosValues.findIndex(r => r[0].toString().trim() === dominio.toString().trim());
    
    if (masterRowIdx === -1) return ui.alert(`❌ No se encontró ${dominio} en el sistema.`);
    const masterRow = masterRowIdx + 2;

    const estadoReal = masterHeaders['estado'] ? masterSheet.getRange(masterRow, masterHeaders['estado']).getValue().toString().trim() : '';
    const vendedorReal = masterHeaders['vendedor_reserva'] ? masterSheet.getRange(masterRow, masterHeaders['vendedor_reserva']).getValue().toString().trim() : '';
    const disponibleReal = masterHeaders['disponible'] ? masterSheet.getRange(masterRow, masterHeaders['disponible']).getValue().toString().trim().toUpperCase() : 'SI';

    // Si YA ESTÁ RESERVADO -> Lógica de Cola de Espera
    if (disponibleReal === 'NO' || estadoReal === 'Reservado') {
      
      // Chequear si el vendedor es el titular actual
      if (vendedorReal === currentUserEmail) {
        return ui.alert('⚠️ Ya sos el titular de la reserva actual de este vehículo.');
      }

      const queueSheet = master.getSheetByName('Colas_Reserva');
      if (!queueSheet) return ui.alert('❌ Faltante: La hoja "Colas_Reserva" no existe en la Master.');

      // Revisar si ya está en cola
      const queueData = queueSheet.getDataRange().getValues();
      const yaEnCola = queueData.some(r => r[0].toString().trim() === dominio.toString().trim() && r[1].toString().trim() === currentUserEmail);
      
      if (yaEnCola) return ui.alert('ℹ️ Ya te encontrás en la cola de espera para este auto.');

      const res = ui.alert('Vehículo Ocupado', `Este auto ya está reservado por ${vendedorReal || 'otro vendedor'}.\n¿Querés anotarte en la cola de espera?`, ui.ButtonSet.YES_NO);
      if (res !== ui.Button.YES) return;

      const clientPrompt = ui.prompt('Cola de Espera', 'Ingresá el Nombre y Apellido de tu cliente:', ui.ButtonSet.OK_CANCEL);
      if (clientPrompt.getSelectedButton() !== ui.Button.OK) return;

      const nombreClienteCola = clientPrompt.getResponseText();
      if (!nombreClienteCola || nombreClienteCola.trim() === "") return ui.alert("⚠️ Tenés que ingresar el nombre del cliente.");
      
      // Agregar a la cola en la Master
      queueSheet.appendRow([dominio, currentUserEmail, nombreClienteCola, new Date()]);
      return ui.alert('✅ Te agregamos a la cola de espera. Te avisamos por email si se libera.');
    }

    // Si está DISPONIBLE -> Lógica de Reserva Normal
    const clientPrompt = ui.prompt('Confirmar Reserva', `Ingresá el Nombre y Apellido de tu cliente para reservar el ${dominio}:`, ui.ButtonSet.OK_CANCEL);
    if (clientPrompt.getSelectedButton() !== ui.Button.OK) return;
    const nombreCliente = clientPrompt.getResponseText();

    if (!nombreCliente || nombreCliente.trim() === "") {
      return ui.alert("⚠️ Tenés que ingresar el nombre del cliente para poder reservar.");
    }

    const expiryDate = calculateExpirationDate();

    // Escribir en Master
    if (masterHeaders['disponible']) masterSheet.getRange(masterRow, masterHeaders['disponible']).setValue('NO');
    if (masterHeaders['estado']) masterSheet.getRange(masterRow, masterHeaders['estado']).setValue('Reservado');
    if (masterHeaders['vendedor_reserva']) masterSheet.getRange(masterRow, masterHeaders['vendedor_reserva']).setValue(currentUserEmail);
    if (masterHeaders['vencimiento_reserva']) masterSheet.getRange(masterRow, masterHeaders['vencimiento_reserva']).setValue(expiryDate);
    if (masterHeaders['cliente_reserva']) masterSheet.getRange(masterRow, masterHeaders['cliente_reserva']).setValue(nombreCliente);

    ui.alert(`✅ ¡Reserva confirmada!\n${dominio} reservado para ${nombreCliente}.`);

    // Enviar email broadcast
    const subject = `¡Vehículo reservado! ${marca} ${modelo} (${dominio})`;
    const body = `Hola,\n\nEl vehículo ${marca} ${modelo} (${dominio}), disponible en ${sucursal}, se ha reservado a nombre de ${nombreCliente} (por el vendedor ${currentUserEmail}) hasta el ${expiryDate.toLocaleString()}.\n\nSaludos.`;
    
    MailApp.sendEmail(EMAILS_NOTIFICACION_VENTAS.join(','), subject, body);

  } catch (e) {
    ui.alert(`❌ Error al conectar con el sistema: ${e.message}`);
  }
}

function releaseReservation() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row <= 1) return ui.alert('⚠️ Seleccioná la fila de un auto.');

  const localHeaders = getHeadersMap(sheet);
  const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dominio = rowData[localHeaders['dominio'] - 1];
  let currentUserEmail = Session.getActiveUser().getEmail();
  
  if (!currentUserEmail || currentUserEmail.trim() === "") {
    const userPrompt = ui.prompt('Identificación', 'Ingresá tu nombre o tu email para registrar la reserva a tu nombre:', ui.ButtonSet.OK_CANCEL);
    if (userPrompt.getSelectedButton() !== ui.Button.OK) return;
    currentUserEmail = userPrompt.getResponseText().trim();
    
    if (!currentUserEmail) return ui.alert('⚠️ Tenés que ingresar un nombre para poder reservar.');
  }
  if (!dominio) return;

  const confirm = ui.alert('🔓 Liberar Reserva', `¿Estás seguro de liberar la reserva de: ${dominio}?`, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  try {
    const master = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    const masterSheet = master.getSheetByName('Stock');
    const masterHeaders = getHeadersMap(masterSheet);
    
    // Buscar el auto en la Master
    const dominiosValues = masterSheet.getRange(2, masterHeaders['dominio'], masterSheet.getLastRow() - 1, 1).getValues();
    const masterRowIdx = dominiosValues.findIndex(r => r[0].toString().trim() === dominio.toString().trim());
    if (masterRowIdx === -1) return ui.alert(`❌ No se encontró ${dominio} en la base.`);
    
    const masterRow = masterRowIdx + 2;
    const actualVendedor = masterHeaders['vendedor_reserva'] ? masterSheet.getRange(masterRow, masterHeaders['vendedor_reserva']).getValue() : '';

    if (actualVendedor && actualVendedor.toString().trim() !== '' && actualVendedor !== currentUserEmail) {
      return ui.alert(`❌ No podés liberar esta reserva porque le pertenece a ${actualVendedor}. Solo el dueño o un Administrador puede hacerlo.`);
    }

    const queueSheet = master.getSheetByName('Colas_Reserva');
    const queueData = queueSheet ? queueSheet.getDataRange().getValues() : [];
    let nextUserIndex = -1;
    
    for (let i = 1; i < queueData.length; i++) {
      if (queueData[i][0].toString().trim() === dominio.toString().trim()) {
        nextUserIndex = i;
        break;
      }
    }

    if (nextUserIndex !== -1) {
      const nextUser = queueData[nextUserIndex][1];
      const clientName = queueData[nextUserIndex][2];
      const expiryDate = calculateExpirationDate();

      if (masterHeaders['vendedor_reserva']) masterSheet.getRange(masterRow, masterHeaders['vendedor_reserva']).setValue(nextUser);
      if (masterHeaders['cliente_reserva']) masterSheet.getRange(masterRow, masterHeaders['cliente_reserva']).setValue(clientName);
      if (masterHeaders['vencimiento_reserva']) masterSheet.getRange(masterRow, masterHeaders['vencimiento_reserva']).setValue(expiryDate);
      
      queueSheet.deleteRow(nextUserIndex + 1);

      const marca = masterHeaders['marca'] ? masterSheet.getRange(masterRow, masterHeaders['marca']).getValue() : '';
      const modelo = masterHeaders['modelo'] ? masterSheet.getRange(masterRow, masterHeaders['modelo']).getValue() : '';

      try {
        MailApp.sendEmail(
          nextUser,
          `¡Vehículo Liberado! ${marca} ${modelo} (${dominio}) ha sido reservado a tu nombre`,
          `Hola,\n\nEl vehículo ${marca} ${modelo} (${dominio}) por el que estabas en cola de espera se acaba de liberar.\n\nEl sistema lo ha reservado automáticamente a tu nombre y al de tu cliente (${clientName}) hasta el ${expiryDate.toLocaleString()}.\n\nSaludos,\nBari Autos.`
        );
      } catch (e) {}

      ui.alert(`✅ Reserva liberada.\nSe le adjudicó automáticamente a ${nextUser}, que estaba en la cola de espera.`);

    } else {
      if (masterHeaders['estado']) masterSheet.getRange(masterRow, masterHeaders['estado']).setValue('En condiciones');
      if (masterHeaders['disponible']) masterSheet.getRange(masterRow, masterHeaders['disponible']).setValue('SI');
      if (masterHeaders['vendedor_reserva']) masterSheet.getRange(masterRow, masterHeaders['vendedor_reserva']).setValue('');
      if (masterHeaders['vencimiento_reserva']) masterSheet.getRange(masterRow, masterHeaders['vencimiento_reserva']).setValue('');
      if (masterHeaders['cliente_reserva']) masterSheet.getRange(masterRow, masterHeaders['cliente_reserva']).setValue('');

      ui.alert(`✅ Reserva de ${dominio} liberada. Vuelve a estar disponible para todos.`);
    }

    // NOTA: Se eliminó el setBackground de acá para que lo maneje el Formato Condicional de Sheets.

  } catch (e) {
    ui.alert(`❌ Error al procesar: ${e.message}`);
  }
}
