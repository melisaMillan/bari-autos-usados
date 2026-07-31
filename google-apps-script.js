// ===================================================
// PLANILLA MASTER - Apps Script
// Versión fusionada: Bari Admin + Publicaciones Inteligentes
// ===================================================

const N8N_WEBHOOK_URL_PUBLICAR = "https://bipolos.app.n8n.cloud/webhook/bari-autos";
const HORA_CORTE = 18;

// ── Colores de fila ───────────────────────────────────
const COLOR_PUBLISHED  = '#b7e1cd'; // Verde suave — publicado
const COLOR_ELIMINATED = '#FCE8E6'; // Rojo muy tenue — dado de baja
const COLOR_OUTDATED   = '#FFE599'; // Amarillo — publicación desactualizada

// ── Hoja oculta de snapshots ─────────────────────────
// NOTA: Se usa "Pub_Snapshots" para no pisar la hoja "Publicaciones"
// que ya existe y guarda id_meli / id_fb / id_ig.
const SHEET_SNAPSHOTS_NAME = "Pub_Snapshots";

// Campos que se monitorean para detectar cambios post-publicación
const SNAPSHOT_FIELD_KEYS = [
  'precio_final_en_ars', 'url_fotos_drive', 'url_foto_miniatura',
  'descripcion_para_publicacion', 'estado', 'km',
  'sucursal', 'financiador', 'precio_financiado'
];

// =====================================================
// MENÚ PRINCIPAL
// =====================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚗 Bari Admin')
    .addItem('🚘 Cargar Vehículo', 'openMeliSidebar')
    .addSeparator()
    .addItem('⚡ Publicar / Actualizar en redes', 'publishActiveRow')
    .addItem('❌ Eliminar de redes', 'deleteActiveRow')
    .addSeparator()
    .addItem('🔓 Forzar Liberación de Reserva', 'forceProcessRelease')
    .addToUi();
}

// =====================================================
// HELPER: Mapa de encabezados → número de columna
// Normalizado: minúsculas, sin tildes, espacios → guión_bajo
// (definición única — reemplaza las dos que había antes)
// =====================================================
function getHeadersMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) {
      var key = headers[i].toString().trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '_');
      map[key] = i + 1; // 1-indexed
    }
  }
  return map;
}

// =====================================================
// CALCULAR FECHA VENCIMIENTO RESERVA (2 días hábiles)
// =====================================================
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

// =====================================================
// FORZAR LIBERACIÓN DE RESERVA MANUALMENTE
// =====================================================
function forceProcessRelease() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row <= 1) return SpreadsheetApp.getUi().alert('Seleccioná la fila del auto a liberar.');
  
  processReleaseLogic(sheet, row);
  SpreadsheetApp.getUi().alert('✅ Procesado. Si había cola, se asignó al siguiente.');
}

// =====================================================
// FUNCIÓN CORE DE LIBERACIÓN
// =====================================================
function processReleaseLogic(masterSheet, rowIndex) {
  const headers = getHeadersMap(masterSheet);
  const dominio = masterSheet.getRange(rowIndex, headers['dominio']).getValue();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const queueSheet = spreadsheet.getSheetByName('Colas_Reserva');
  
  const queueData = queueSheet.getDataRange().getValues();
  let nextUserIndex = -1;
  
  for (let i = 1; i < queueData.length; i++) {
    if (queueData[i][0] === dominio) {
      nextUserIndex = i;
      break;
    }
  }

  if (nextUserIndex !== -1) {
    const nextUser   = queueData[nextUserIndex][1]; // Vendedor
    const clientName = queueData[nextUserIndex][2]; // Cliente
    const expiryDate = calculateExpirationDate();

    if (headers['vendedor_reserva'])  masterSheet.getRange(rowIndex, headers['vendedor_reserva']).setValue(nextUser);
    if (headers['cliente_reserva'])   masterSheet.getRange(rowIndex, headers['cliente_reserva']).setValue(clientName);
    if (headers['vencimiento_reserva']) masterSheet.getRange(rowIndex, headers['vencimiento_reserva']).setValue(expiryDate);
    
    queueSheet.deleteRow(nextUserIndex + 1);

    const marca  = headers['marca']  ? masterSheet.getRange(rowIndex, headers['marca']).getValue()  : '';
    const modelo = headers['modelo'] ? masterSheet.getRange(rowIndex, headers['modelo']).getValue() : '';
    
    try {
      MailApp.sendEmail(
        nextUser,
        `¡Vehículo Liberado! ${marca} ${modelo} (${dominio}) ha sido reservado a tu nombre`,
        `Hola,\n\nEl vehículo ${marca} ${modelo} (${dominio}) (Fila ${rowIndex}) por el que estabas en cola de espera se acaba de liberar.\n\nEl sistema lo ha reservado automáticamente a tu nombre y al de tu cliente (${clientName}) hasta el ${expiryDate.toLocaleString()}.\n\nSaludos,\nBari Autos.`
      );
    } catch (e) { console.error(e); }

  } else {
    // Nadie en cola → liberar
    if (headers['estado'])             masterSheet.getRange(rowIndex, headers['estado']).setValue('En condiciones');
    if (headers['disponible'])         masterSheet.getRange(rowIndex, headers['disponible']).setValue('SI');
    if (headers['vendedor_reserva'])   masterSheet.getRange(rowIndex, headers['vendedor_reserva']).setValue('');
    if (headers['vencimiento_reserva']) masterSheet.getRange(rowIndex, headers['vencimiento_reserva']).setValue('');
    if (headers['cliente_reserva'])    masterSheet.getRange(rowIndex, headers['cliente_reserva']).setValue('');
  }
}

// =====================================================
// CRON JOB: libera reservas vencidas (trigger diario)
// =====================================================
function checkExpiredReservations() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Stock');
  const data    = sheet.getDataRange().getValues();
  const headers = getHeadersMap(sheet);
  const colEstado     = headers['estado'];
  const colVencimiento = headers['vencimiento_reserva'];
  
  if (!colEstado || !colVencimiento) return;
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    const estado = data[i][colEstado - 1];
    const venc   = data[i][colVencimiento - 1];
    if (estado === 'Reservado' && venc instanceof Date && venc < now) {
      processReleaseLogic(sheet, i + 1);
    }
  }
}

// =====================================================
// N8N: PUBLICAR / ELIMINAR
// =====================================================
function publishActiveRow() { sendRowToN8n('Publicar'); }
function deleteActiveRow()   { sendRowToN8n('Eliminar'); }

function sendRowToN8n(action) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row   = sheet.getActiveCell().getRow();
  if (row <= 1) return;

  const headers   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const carData   = {};
  
  headers.forEach((header, index) => {
    if (header) {
      const key = header.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '_');
      carData[key] = rowValues[index];
    }
  });

  // Leer IDs existentes desde la hoja 'Publicaciones' (id_meli, id_fb, id_ig)
  const pubSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Publicaciones');
  if (pubSheet) {
    const pubData = pubSheet.getDataRange().getValues();
    for (let i = 1; i < pubData.length; i++) {
      if (pubData[i][0] === carData['dominio']) {
        carData['id_meli'] = pubData[i][1];
        carData['id_fb']   = pubData[i][2];
        carData['id_ig']   = pubData[i][3];
        break;
      }
    }
  }

  const payload = { action, rowIndex: row, timestamp: new Date().toISOString(), car: carData };
  SpreadsheetApp.getActiveSpreadsheet().toast('Enviando...', 'n8n', 3);

  try {
    const response = UrlFetchApp.fetch(N8N_WEBHOOK_URL_PUBLICAR, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      // ── Colorear la fila completa ────────────────────────────────
      const rowRange = sheet.getRange(row, 1, 1, sheet.getLastColumn());
      if (action === 'Publicar') {
        rowRange.setBackground(COLOR_PUBLISHED);
        savePublicationSnapshot(row, carData);   // Guardar snapshot
      } else if (action === 'Eliminar') {
        rowRange.setBackground(COLOR_ELIMINATED);
        removePublicationSnapshot(row);          // Borrar snapshot
      }
      SpreadsheetApp.getActiveSpreadsheet().toast('✅ ¡Operación exitosa!', 'n8n', 4);
    } else {
      SpreadsheetApp.getUi().alert('Error n8n', 'Código ' + code + ':\n' + response.getContentText(), SpreadsheetApp.getUi().ButtonSet.OK);
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error de conexión', e.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// =====================================================
// SNAPSHOT DE PUBLICACIÓN (hoja oculta "Pub_Snapshots")
// =====================================================

function getOrCreateSnapshotsSheet() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let snap   = ss.getSheetByName(SHEET_SNAPSHOTS_NAME);
  if (!snap) {
    snap = ss.insertSheet(SHEET_SNAPSHOTS_NAME);
    const headerRow = ['fila', 'dominio', 'descripcion_corta', 'fecha_publicacion'].concat(SNAPSHOT_FIELD_KEYS);
    snap.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    snap.hideSheet();
  }
  return snap;
}

function savePublicationSnapshot(rowIndex, carData) {
  const snap   = getOrCreateSnapshotsSheet();
  const data   = snap.getDataRange().getValues();
  const dominio = (carData['dominio'] || '').toString().trim();
  const desc    = ((carData['marca'] || '') + ' ' + (carData['modelo'] || '')).trim();
  const valores = SNAPSHOT_FIELD_KEYS.map(k => (carData[k] || '').toString().trim());
  const newRow  = [rowIndex, dominio, desc, new Date()].concat(valores);

  let existingNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == rowIndex) { existingNum = i + 1; break; }
  }

  if (existingNum > 0) {
    snap.getRange(existingNum, 1, 1, newRow.length).setValues([newRow]);
  } else {
    snap.appendRow(newRow);
  }
}

function removePublicationSnapshot(rowIndex) {
  const snap = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SNAPSHOTS_NAME);
  if (!snap) return;
  const data = snap.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == rowIndex) { snap.deleteRow(i + 1); return; }
  }
}

// =====================================================
// DETECCIÓN EN TIEMPO REAL: onEdit
// Detecta cambios en filas publicadas y cambia el color
// =====================================================

function isRowOutdated(sheet, rowIndex, headersMap, snapData) {
  let snapshotRow = null;
  for (let i = 1; i < snapData.length; i++) {
    if (snapData[i][0] == rowIndex) { snapshotRow = snapData[i]; break; }
  }
  if (!snapshotRow) return false;

  const currentValues = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  const currentMap = {};
  Object.keys(headersMap).forEach(key => {
    currentMap[key] = (currentValues[headersMap[key] - 1] || '').toString().trim();
  });

  for (let k = 0; k < SNAPSHOT_FIELD_KEYS.length; k++) {
    const snapVal = (snapshotRow[4 + k] || '').toString().trim();
    const currVal = currentMap[SNAPSHOT_FIELD_KEYS[k]] || '';
    if (snapVal !== currVal) return true;
  }
  return false;
}

/**
 * Trigger simple onEdit — detecta cambios en filas publicadas en tiempo real.
 * 🟡 Naranja = publicación desactualizada / 🟢 Verde = al día con lo publicado
 */
function onEdit(e) {
  if (!e) return;
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== 'Stock') return; // Solo monitorear la hoja Stock

  const rowIndex = e.range.getRow();
  if (rowIndex <= 1) return; // Ignorar cabeceras

  const snap = e.source.getSheetByName(SHEET_SNAPSHOTS_NAME);
  if (!snap) return;

  const snapData = snap.getDataRange().getValues();
  let isPublished = false;
  for (let i = 1; i < snapData.length; i++) {
    if (snapData[i][0] == rowIndex) { isPublished = true; break; }
  }
  if (!isPublished) return;

  const headersMap = getHeadersMap(sheet);
  const rowRange   = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn());

  if (isRowOutdated(sheet, rowIndex, headersMap, snapData)) {
    rowRange.setBackground(COLOR_OUTDATED);  // 🟡 Naranja
  } else {
    rowRange.setBackground(COLOR_PUBLISHED); // 🟢 Verde
  }
}

// =====================================================
// SIDEBAR: ABRIR PANEL DE CARGA
// =====================================================
function openMeliSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
      .setTitle('🚗 Carga de Vehículo')
      .setWidth(380);
  SpreadsheetApp.getUi().showSidebar(html);
}

// =====================================================
// PROXY SEGURO HACIA N8N (sin CORS, llamado desde sidebar)
// =====================================================
function fetchN8nWebhook(url) {
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return JSON.parse(response.getContentText());
  } catch (e) {
    return { error: e.message };
  }
}

// =====================================================
// HELPER: Convierte número de columna a letra (1=A, 27=AA)
// =====================================================
function columnToLetter(column) {
  var temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

// =====================================================
// GUARDAR VEHÍCULO EN PRIMERA FILA VACÍA
// Llamado desde el Sidebar con los datos del formulario
// =====================================================
function writeNewVehicle(data) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Stock') || ss.getActiveSheet();
    var lastRow = sheet.getLastRow();
    
    // Encontrar la primera fila vacía (columna B = Marca)
    var newRow = lastRow + 1;
    if (lastRow > 1) {
      var colValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (var i = 0; i < colValues.length; i++) {
        if (!colValues[i][0] || colValues[i][0].toString().trim() === '') {
          newRow = i + 2;
          break;
        }
      }
    }
    
    var map = getHeadersMap(sheet); // Usa la misma función normalizada
    
    function setVal(headerNorm, value) {
      var col = map[headerNorm];
      if (col && value !== undefined && value !== null && value !== '') {
        sheet.getRange(newRow, col).setValue(value);
      }
    }
    function setFormula(headerNorm, formula) {
      var col = map[headerNorm];
      if (col) sheet.getRange(newRow, col).setFormula(formula);
    }
    
    // --- Datos del vehículo ---
    setVal('segmento',    data.segmento);
    setVal('marca',       data.marca);
    setVal('modelo',      data.modelo);
    setVal('version',     data.version);
    setVal('ano',         data.anio);
    setVal('color',       data.color);
    setVal('transmision', data.transmision);
    setVal('puertas',     data.puertas);
    
    // --- Ficha técnica ---
    setVal('dominio',    data.dominio);
    setVal('km',         data.km ? parseInt(data.km.toString().replace(/\./g, ''), 10) : '');
    setVal('combustible', data.combustible);
    
    // --- Comercial ---
    setVal('sucursal',          data.sucursal);
    setVal('vendedor',          data.vendedor);
    setVal('fecha_toma',        new Date());
    setVal('precio_final_en_ars',  data.precioFinal  ? parseFloat(data.precioFinal.toString().replace(/\./g, '').replace(',', '.'))  : '');
    setVal('precio_basico_en_ars', data.precioBasico ? parseFloat(data.precioBasico.toString().replace(/\./g, '').replace(',', '.')) : '');
    setVal('iva',               data.iva ? parseFloat(data.iva.toString().replace(/\./g, '').replace(',', '.')) : '');
    setVal('estado',            data.estado);
    setVal('financiador',       data.financiador);
    
    // --- Disponibilidad ---
    setVal('disponible',  data.disponible);
    setVal('publicar',    data.publicar);
    setVal('oportunidad', data.oportunidad);
    
    // --- Publicación ---
    setVal('url_fotos_drive',           data.urlFotos);
    setVal('url_foto_miniatura',        data.urlMiniatura);
    setVal('descripcion_para_publicacion', data.descripcion);
    setVal('comentario_interno',        data.comentario);
    
    // --- Fórmulas automáticas ---
    var urlFotosCol  = map['url_fotos_drive'];
    var fotosCol     = map['fotos'];
    if (fotosCol && urlFotosCol) {
      var letraFotos = columnToLetter(urlFotosCol);
      setFormula('fotos', '=IF(' + letraFotos + newRow + '="";"";IMAGE("https://drive.google.com/uc?export=view&id="&REGEXEXTRACT(' + letraFotos + newRow + ';"\\/d\\/([^\\/]+)")))');
    }
    
    var urlMiniaturaCol = map['url_foto_miniatura'];
    var miniaturaCol    = map['miniatura'];
    if (miniaturaCol && urlMiniaturaCol) {
      var letraMini = columnToLetter(urlMiniaturaCol);
      setFormula('miniatura', '=IF(' + letraMini + newRow + '="";"";IMAGE("https://drive.google.com/uc?export=view&id="&REGEXEXTRACT(' + letraMini + newRow + ';"\\/d\\/([^\\/]+)")))');
    }
    
    var financiadorCol     = map['financiador'];
    var precioFinalCol     = map['precio_final_en_ars'];
    var precioFinanciadoCol = map['precio_financiado'];
    if (precioFinanciadoCol && financiadorCol && precioFinalCol) {
      var letraFin   = columnToLetter(financiadorCol);
      var letraPrecio = columnToLetter(precioFinalCol);
      setFormula('precio_financiado', '=IF(' + letraFin + newRow + '="";"";VLOOKUP(' + letraFin + newRow + ';\'FINANCIACIÓN\'!$A$11:$L$17;2;FALSE))*' + letraPrecio + newRow);
    }
    
    return { success: true, message: '✅ Vehículo cargado en fila ' + newRow + '!', row: newRow };
    
  } catch (e) {
    return { success: false, message: '❌ Error: ' + e.message };
  }
}
