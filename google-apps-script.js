const N8N_WEBHOOK_URL="https://bipolos.app.n8n.cloud/webhook/bari-autos" 
const SHEET_CONFIG_NAME = "Configuración";
const SHEET_COLAS_NAME = "Colas de Reserva";


/**
 * Evento que se ejecuta al abrir la hoja de cálculo.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚗 Bari Autos')
      .addItem('🕒 Solicitar Reserva', 'requestReservation')
      .addItem('🔓 Liberar Reserva', 'releaseReservation')
      .addSeparator()
      .addItem('🌐 Publicar en redes', 'publishActiveRow')
      .addItem('❌ Eliminar publicación', 'deleteActiveRow')
      .addToUi();
}

// Se eliminó la función onEdit debido a restricciones de seguridad de Google 
// (Session.getActiveUser() devuelve vacío en triggers simples).

/**
 * Verifica si un email está en la lista de administradores.
 */
function isAdmin(email) {
  const adminsString = getConfigValue("Admins", "");
  if (!adminsString) return false;
  
  const admins = adminsString.split(",").map(e => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

/**
 * Busca una hoja por nombre ignorando mayúsculas/minúsculas.
 */
function getSheetCaseInsensitive(spreadsheet, name) {
  const sheets = spreadsheet.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === name.toLowerCase()) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * Obtiene un valor de la hoja de configuración.
 */
function getConfigValue(key, defaultValue) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = getSheetCaseInsensitive(spreadsheet, SHEET_CONFIG_NAME);
  if (!configSheet) return defaultValue;
  
  const data = configSheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim().toLowerCase() === key.toLowerCase()) {
      return data[i][1] || defaultValue;
    }
  }
  return defaultValue;
}

/**
 * Mapea los encabezados a sus índices de columna (1-based).
 */
function getHeadersMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    if(h) {
      const key = h.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, '_');
      map[key] = i + 1;
    }
  });
  return map;
}

/**
 * Calcula la fecha de expiración sumando 2 días hábiles y seteando la hora de corte.
 */
function calculateExpirationDate() {
  const cutoffValue = getConfigValue("hora de corte", "18:00");
  
  let hours = 18;
  let minutes = 0;
  
  // Google Sheets a menudo parsea "18:00" como un objeto Date (1899-12-30 18:00:00)
  if (cutoffValue instanceof Date) {
    hours = cutoffValue.getHours();
    minutes = cutoffValue.getMinutes();
  } else {
    const timeParts = cutoffValue.toString().split(":");
    hours = timeParts[0] ? parseInt(timeParts[0], 10) : 18;
    minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
    
    if (isNaN(hours)) hours = 18;
    if (isNaN(minutes)) minutes = 0;
  }
  
  let date = new Date();
  let addedDays = 0;
  
  while (addedDays < 2) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }
  
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Añade un registro a la hoja visible de Colas de Reserva.
 */
function logToQueueSheet(carId, carName, userEmail) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const queueSheet = getSheetCaseInsensitive(spreadsheet, SHEET_COLAS_NAME);
  if (!queueSheet) return;
  
  queueSheet.appendRow([carId, carName, userEmail, new Date()]);
}

/**
 * Elimina (o busca) el primer registro coincidente de un usuario y vehículo de la hoja de Colas.
 */
function removeFirstFromQueueSheet(carId, userEmail) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const queueSheet = getSheetCaseInsensitive(spreadsheet, SHEET_COLAS_NAME);
  if (!queueSheet) return;
  
  const data = queueSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { // Evitar cabeceras
    if (data[i][0] == carId && data[i][2].toString().toLowerCase() === userEmail.toLowerCase()) {
      queueSheet.deleteRow(i + 1);
      break;
    }
  }
}

/**
 * Lógica para que un vendedor solicite la reserva del vehículo de la fila actual.
 */
function requestReservation() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const activeRow = sheet.getActiveRange().getRowIndex();
  
  if (activeRow === 1) return SpreadsheetApp.getUi().alert('Aviso', 'No puedes reservar la fila de cabeceras.', SpreadsheetApp.getUi().ButtonSet.OK);
  
  const headers = getHeadersMap(sheet);
  const colEstado = headers['estado'];
  const colVendedor = headers['vendedor_reserva'];
  const colVencimiento = headers['vencimiento_reserva'];
  const colCola = headers['cola_espera'];
  const colId = headers['patente']; // MODIFICADO PARA USAR 'patente'
  
  if (!colEstado || !colVendedor || !colVencimiento || !colCola || !colId) {
    return SpreadsheetApp.getUi().alert('Error', 'Faltan columnas necesarias en la hoja de stock (estado, vendedor_reserva, vencimiento_reserva, cola_espera, patente).', SpreadsheetApp.getUi().ButtonSet.OK);
  }
  
  const estado = sheet.getRange(activeRow, colEstado).getValue();
  const carId = sheet.getRange(activeRow, colId).getValue();
  const marca = sheet.getRange(activeRow, headers['marca'] ? headers['marca'] : 1).getValue();
  const modelo = sheet.getRange(activeRow, headers['modelo'] ? headers['modelo'] : 1).getValue();
  const carName = marca + ' ' + modelo;
  
  const currentUserEmail = Session.getActiveUser().getEmail();
  
  if (estado !== 'Reservado' && estado !== 'Vendido') {
    // El vehículo está disponible
    const expiryDate = calculateExpirationDate();
    sheet.getRange(activeRow, colEstado).setValue('Reservado');
    sheet.getRange(activeRow, colVendedor).setValue(currentUserEmail);
    sheet.getRange(activeRow, colVencimiento).setValue(expiryDate);
    
    SpreadsheetApp.getUi().alert('Reserva Exitosa', `Vehículo reservado para ${currentUserEmail} hasta el ${expiryDate.toLocaleString()}.`, SpreadsheetApp.getUi().ButtonSet.OK);
  } else if (estado === 'Reservado') {
    // Ya está reservado
    const actualVendedor = sheet.getRange(activeRow, colVendedor).getValue();
    if (actualVendedor === currentUserEmail) {
      return SpreadsheetApp.getUi().alert('Aviso', 'Ya tienes este vehículo reservado bajo tu nombre.', SpreadsheetApp.getUi().ButtonSet.OK);
    }
    
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      'Vehículo Ocupado',
      `Este auto está reservado por ${actualVendedor}.\n¿Deseas anotarte en la cola de espera para ser notificado si se libera?`,
      ui.ButtonSet.YES_NO
    );
    
    if (response == ui.Button.YES) {
      let currentQueue = sheet.getRange(activeRow, colCola).getValue().toString();
      let queueArray = currentQueue ? currentQueue.split(',').map(e => e.trim()) : [];
      if (!queueArray.includes(currentUserEmail)) {
        queueArray.push(currentUserEmail);
        sheet.getRange(activeRow, colCola).setValue(queueArray.join(', '));
        logToQueueSheet(carId, carName, currentUserEmail); // Log a la hoja visible
        ui.alert('Aviso', 'Te hemos añadido a la cola de espera. Podrás verlo en la pestaña Colas de Reserva.', ui.ButtonSet.OK);
      } else {
        ui.alert('Aviso', 'Ya te encuentras en la cola de espera de este vehículo.', ui.ButtonSet.OK);
      }
    }
  } else {
    SpreadsheetApp.getUi().alert('Aviso', 'El vehículo ya figura como vendido.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Lógica para liberar la reserva de un vehículo manualmente.
 */
function releaseReservation() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const activeRow = sheet.getActiveRange().getRowIndex();
  
  if (activeRow === 1) return;
  
  const headers = getHeadersMap(sheet);
  const colEstado = headers['estado'];
  const colVendedor = headers['vendedor_reserva'];
  
  if (!colEstado || !colVendedor) return;
  
  const estado = sheet.getRange(activeRow, colEstado).getValue();
  const actualVendedor = sheet.getRange(activeRow, colVendedor).getValue();
  const currentUserEmail = Session.getActiveUser().getEmail();
  
  if (estado !== 'Reservado') {
    return SpreadsheetApp.getUi().alert('Aviso', 'Este vehículo no está reservado actualmente.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
  
  // Validar si es dueño o administrador
  if (actualVendedor !== currentUserEmail && !isAdmin(currentUserEmail)) {
    return SpreadsheetApp.getUi().alert('Acceso Denegado', `La reserva le pertenece a ${actualVendedor}. Solo el titular o un Administrador pueden liberarla.`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
  
  processRelease(sheet, activeRow, headers);
  SpreadsheetApp.getUi().alert('Aviso', 'El vehículo ha sido liberado (o reasignado al próximo en la cola de espera).', SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Función central que libera un auto y procesa la cola de espera.
 */
function processRelease(sheet, rowIndex, headers) {
  const colEstado = headers['estado'];
  const colVendedor = headers['vendedor_reserva'];
  const colVencimiento = headers['vencimiento_reserva'];
  const colCola = headers['cola_espera'];
  const colId = headers['patente']; // MODIFICADO PARA USAR 'patente'
  
  let queue = sheet.getRange(rowIndex, colCola).getValue().toString();
  let queueArray = queue ? queue.split(',').map(e => e.trim()).filter(e => e.length > 0) : [];
  
  if (queueArray.length > 0) {
    // Alguien espera en la cola
    const nextUser = queueArray.shift();
    const expiryDate = calculateExpirationDate();
    
    sheet.getRange(rowIndex, colVendedor).setValue(nextUser);
    sheet.getRange(rowIndex, colVencimiento).setValue(expiryDate);
    sheet.getRange(rowIndex, colCola).setValue(queueArray.join(', ')); // Actualizar cola oculta
    
    // Limpiar al usuario afortunado de la hoja visible de Colas
    const carId = sheet.getRange(rowIndex, colId).getValue();
    removeFirstFromQueueSheet(carId, nextUser);
    
    // Enviar notificación
    let marca = "Vehículo", modelo = "";
    if (headers['marca']) marca = sheet.getRange(rowIndex, headers['marca']).getValue();
    if (headers['modelo']) modelo = sheet.getRange(rowIndex, headers['modelo']).getValue();
    
    const subject = `¡Vehículo Liberado! ${marca} ${modelo} te ha sido reservado`;
    const body = `Hola,\n\nEl vehículo ${marca} ${modelo} (Fila ${rowIndex}) por el que estabas en cola de espera se acaba de liberar.\n\nEl sistema lo ha reservado automáticamente a tu nombre hasta el ${expiryDate.toLocaleString()}.\n\nSaludos,\nBari Autos.`;
    
    try {
      MailApp.sendEmail(nextUser, subject, body);
    } catch(e) {
      console.error("Error enviando email a " + nextUser + ": " + e);
    }
  } else {
    // Nadie espera
    sheet.getRange(rowIndex, colEstado).setValue('Disponible');
    sheet.getRange(rowIndex, colVendedor).setValue('');
    sheet.getRange(rowIndex, colVencimiento).setValue('');
  }
}

/**
 * CRON JOB: Ejecutada por un trigger diario para limpiar reservas vencidas.
 */
function checkExpiredReservations() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheets()[0]; 
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) return;
  
  const headersMap = {};
  data[0].forEach((h, i) => {
    if(h) {
      const key = h.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, '_');
      headersMap[key] = i + 1;
    }
  });
  
  const colEstado = headersMap['estado'];
  const colVencimiento = headersMap['vencimiento_reserva'];
  
  if (!colEstado || !colVencimiento) return;
  
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    const estado = data[i][colEstado - 1];
    const vencimiento = data[i][colVencimiento - 1];
    
    if (estado === 'Reservado' && (vencimiento instanceof Date || Date.parse(vencimiento))) {
      const vencimientoDate = new Date(vencimiento);
      if (vencimientoDate < now) {
        processRelease(sheet, i + 1, headersMap);
      }
    }
  }
}

// =========================================================
// FUNCIONES EXISTENTES PARA N8N (SOLO ADMINS)
// =========================================================

function publishActiveRow() {
  const currentUser = Session.getActiveUser().getEmail();
  if (!isAdmin(currentUser)) {
    return SpreadsheetApp.getUi().alert('Acceso Denegado', 'Solo los administradores pueden publicar vehículos en las plataformas externas.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
  sendRowToN8n('Publicar');
}

function deleteActiveRow() {
  const currentUser = Session.getActiveUser().getEmail();
  if (!isAdmin(currentUser)) {
    return SpreadsheetApp.getUi().alert('Acceso Denegado', 'Solo los administradores pueden dar de baja vehículos de las plataformas externas.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Confirmar', '¿Seguro que deseas eliminar este vehículo de las plataformas asociadas?', ui.ButtonSet.YES_NO);
  if (response == ui.Button.YES) sendRowToN8n('Eliminar');
}

function sendRowToN8n(action) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const activeRange = sheet.getActiveRange();
  
  if (!activeRange) return SpreadsheetApp.getUi().alert('Error', 'Selecciona una fila primero.', SpreadsheetApp.getUi().ButtonSet.OK);
  
  const activeRowIndex = activeRange.getRowIndex();
  if (activeRowIndex === 1) return SpreadsheetApp.getUi().alert('Aviso', 'No se procesa la fila de cabeceras.', SpreadsheetApp.getUi().ButtonSet.OK);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowValues = sheet.getRange(activeRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const carData = {};
  headers.forEach((header, index) => {
    if (header) {
      const key = header.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
      carData[key] = rowValues[index];
    }
  });

  const payload = { action: action, rowIndex: activeRowIndex, timestamp: new Date().toISOString(), car: carData };
  SpreadsheetApp.getActiveSpreadsheet().toast('Enviando datos a n8n...', 'Integración', 5);

  try {
    const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
    const response = UrlFetchApp.fetch(N8N_WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode >= 200 && responseCode < 300) {
      SpreadsheetApp.getActiveSpreadsheet().toast('¡Operación realizada con éxito!', 'Integración', 5);
      const statusColIndex = headers.indexOf('estado') + 1;
      if (statusColIndex > 0) sheet.getRange(activeRowIndex, statusColIndex).setValue(action === 'Eliminar' ? 'Vendido' : 'Disponible');
    } else {
      SpreadsheetApp.getUi().alert('Error', 'Error del servidor (Código: ' + responseCode + '). Detalle: ' + response.getContentText(), SpreadsheetApp.getUi().ButtonSet.OK);
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error de Conexión', 'No se conectó con n8n. ' + error.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
