// ============================================================
//  PERIÓDICO DIGITAL - FE Y ALEGRÍA LA CIMA
//  Code.gs
// ============================================================

const PERIODICO_FOLDER_ID = '1cjQjI-6Lj_NLDMyELEmy9fUy1klpdmGb';
const SPREADSHEET_ID      = '1_oT9LbZq3u0twZ6pvfBWaeoBD2G1QjfYC1BLwR2_QOk';

const NOMBRES_MESES = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const TOKENS_ACCESO = {
  'anmatamon@gmail.com':                    'cima2025',
  'angela.taborda@feyalegrialacima.edu.co': 'cima2025',
  'diana.taborda@feyalegrialacima.edu.co':  'cima2025',
  'omar.taborda@feyalegrialacima.edu.co':   'cima2025',
  'janeth.taborda@feyalegrialacima.edu.co': 'cima2025'
};

// ============================================================
//  PUNTO DE ENTRADA WEB
// ============================================================
function doGet(e) {
  const page   = (e && e.parameter && e.parameter.page)   || 'index';
  const action = (e && e.parameter && e.parameter.action) || '';

  // Peticiones fetch desde el index.html externo (GitHub Pages)
  if (action === 'noticiasPublicas') {
    return ContentService
      .createTextOutput(JSON.stringify(obtenerNoticiasPublicas()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'meses') {
    const noticias = obtenerNoticiasPublicas();
    const meses = [...new Set(noticias.map(n => n.mes).filter(Boolean))].sort();
    return ContentService
      .createTextOutput(JSON.stringify(meses))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'cuerpo') {
    const id = (e && e.parameter && e.parameter.id) || '';
    try {
      const sheet = obtenerHoja();
      const data  = sheet.getDataRange().getValues();
      const headers = data[0];
      const colId  = headers.indexOf('ID');
      const colUrl = headers.indexOf('URL Documento');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][colId]) === id) {
          const texto = obtenerTextoNoticia(String(data[i][colUrl] || ''));
          return ContentService
            .createTextOutput(JSON.stringify(texto || ''))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    } catch(err) {}
    return ContentService
      .createTextOutput(JSON.stringify(''))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Acciones del admin (GET) ──────────────────────────────
  if (action === 'verificarToken') {
    const email = (e.parameter.email || '').trim();
    const token = (e.parameter.token || '').trim();
    return json(verificarToken(email, token));
  }
  if (action === 'todasLasNoticias') {
    const auth = verificarToken(e.parameter.email||'', e.parameter.token||'');
    if (!auth.ok) return json({ ok:false, error:'No autorizado' });
    return json(obtenerTodasLasNoticias());
  }
  if (action === 'estadisticas') {
    const auth = verificarToken(e.parameter.email||'', e.parameter.token||'');
    if (!auth.ok) return json({ ok:false, error:'No autorizado' });
    return json(obtenerEstadisticas());
  }
  if (action === 'eventosCalendario') {
    const auth = verificarToken(e.parameter.email||'', e.parameter.token||'');
    if (!auth.ok) return json({ ok:false, error:'No autorizado' });
    return json(obtenerEventosCalendario());
  }

  // Web App normal
  if (page === 'admin') {
    return HtmlService.createTemplateFromFile('admin')
      .evaluate()
      .setTitle('Admin — Periódico La Cima')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Periódico Digital — Fe y Alegría La Cima')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
//  HELPER JSON (CORS incluido)
// ============================================================
function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  PUNTO DE ENTRADA POST  (acciones del admin desde GitHub Pages)
// ============================================================
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch(err) {}

  const action = body.action || '';
  const auth   = verificarToken(body.email || '', body.token || '');

  if (action === 'publicarNoticia') {
    // publicarNoticia ya verifica credenciales internamente
    const payload = Object.assign({}, body);
    payload.emailAutor  = body.email  || body.emailAutor  || '';
    payload.tokenAcceso = body.token  || body.tokenAcceso || '';
    return json(publicarNoticia(payload));
  }

  // Las demás acciones requieren auth válida
  if (!auth.ok) return json({ ok: false, error: 'No autorizado: ' + auth.razon });

  if (action === 'cambiarEstado') {
    return json(cambiarEstadoNoticia(body.id, body.estado));
  }
  if (action === 'eliminarNoticia') {
    return json(eliminarNoticia(body.id));
  }
  if (action === 'generarNoticia') {
    return json(generarNoticiaConIA(body.evento || {}));
  }

  return json({ ok: false, error: 'Acción desconocida: ' + action });
}

// ============================================================
//  AUTENTICACIÓN
// ============================================================
function verificarToken(email, token) {
  if (!email || !token) return { ok: false, razon: 'sin_datos' };
  email = email.toLowerCase().trim();
  const tokenEsperado = TOKENS_ACCESO[email];
  if (!tokenEsperado)          return { ok: false, razon: 'usuario_no_autorizado', email };
  if (token !== tokenEsperado) return { ok: false, razon: 'token_invalido' };
  return { ok: true, email, esAdmin: true };
}

function verificarSesion() {
  return { ok: false, razon: 'sin_sesion' };
}

// ============================================================
//  HELPERS CARPETAS
// ============================================================
function obtenerSubcarpeta(carpetaPadre, nombre) {
  const iter = carpetaPadre.getFoldersByName(nombre);
  if (iter.hasNext()) return iter.next();
  return carpetaPadre.createFolder(nombre);
}

function obtenerCarpetasMes() {
  const ahora     = new Date();
  const mes       = ahora.getMonth() + 1;
  const nombreMes = NOMBRES_MESES[mes];
  const raiz         = DriveApp.getFolderById(PERIODICO_FOLDER_ID);
  const carpetaMes   = obtenerSubcarpeta(raiz, nombreMes);
  const carpetaTexto      = obtenerSubcarpeta(carpetaMes, 'texto (noticias)');
  const carpetaImagenes   = obtenerSubcarpeta(carpetaMes, 'imagenes');
  const carpetaMultimedia = obtenerSubcarpeta(carpetaMes, 'multimedia (audio y video)');
  return { carpetaMes, carpetaTexto, carpetaImagenes, carpetaMultimedia, nombreMes, mes };
}

// ============================================================
//  HOJA NOTICIAS
// ============================================================
function obtenerHoja() {
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Noticias');
  if (!sheet) {
    sheet = ss.insertSheet('Noticias');
    sheet.appendRow([
      'ID','Título','Subtítulo','Categoría','Autor','Tipo','Fecha',
      'Mes','Estado','URL Documento','URL Portada','URL Multimedia'
    ]);
    sheet.getRange(1,1,1,12).setFontWeight('bold');
  }
  return sheet;
}

// ============================================================
//  PUBLICAR NOTICIA
// ============================================================
function publicarNoticia(payload) {
  if (!payload.emailAutor || !payload.tokenAcceso) {
    return { ok: false, error: 'No autorizado: credenciales faltantes' };
  }
  const auth = verificarToken(payload.emailAutor, payload.tokenAcceso);
  if (!auth.ok) return { ok: false, error: 'No autorizado: ' + auth.razon };

  try {
    const ahora    = new Date();
    const fechaStr = Utilities.formatDate(ahora, 'America/Bogota', 'yyyy-MM-dd HH:mm');
    const { carpetaTexto, carpetaImagenes, carpetaMultimedia, nombreMes } = obtenerCarpetasMes();

    let urlImagenPortada = '';
    let urlMultimedia    = '';

    if (payload.archivos && payload.archivos.length > 0) {
      payload.archivos.forEach(archivo => {
        const bytes = Utilities.base64Decode(archivo.base64);
        const blob  = Utilities.newBlob(bytes, archivo.mimeType, archivo.nombre);
        if (archivo.mimeType.startsWith('image/')) {
          const f = carpetaImagenes.createFile(blob);
          if (!urlImagenPortada) {
            urlImagenPortada = 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800';
          }
        } else {
          const f = carpetaMultimedia.createFile(blob);
          if (!urlMultimedia) urlMultimedia = f.getUrl();
        }
      });
    }

    if (!urlImagenPortada && payload.svgPortada) {
      const blob = Utilities.newBlob(payload.svgPortada, 'image/svg+xml', payload.titulo + '.svg');
      const f    = carpetaImagenes.createFile(blob);
      urlImagenPortada = 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800';
    }

    const doc  = DocumentApp.create(payload.titulo);
    const body = doc.getBody();
    body.appendParagraph(payload.titulo).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (payload.subtitulo) body.appendParagraph(payload.subtitulo).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('Autor: '     + (payload.autor || auth.email));
    body.appendParagraph('Fecha: '     + fechaStr);
    body.appendParagraph('Categoría: ' + (payload.categoria || 'General'));
    body.appendHorizontalRule();
    body.appendParagraph(payload.cuerpo || '');
    doc.saveAndClose();

    const docFile = DriveApp.getFileById(doc.getId());
    carpetaTexto.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);

    const sheet  = obtenerHoja();
    const id     = Utilities.getUuid();
    const estado = payload.publicar ? 'publicado' : 'borrador';

    sheet.appendRow([
      id, payload.titulo, payload.subtitulo || '', payload.categoria || 'General',
      payload.autor || auth.email, payload.tipo || 'texto',
      fechaStr, nombreMes, estado,
      docFile.getUrl(), urlImagenPortada, urlMultimedia
    ]);

    return {
      ok: true, id, estado,
      mensaje: estado === 'publicado' ? '¡Noticia publicada exitosamente!' : 'Guardada como borrador.'
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ============================================================
//  CAMBIAR ESTADO / ELIMINAR
// ============================================================
function cambiarEstadoNoticia(id, nuevoEstado) {
  try {
    const sheet = obtenerHoja();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i+1, 9).setValue(nuevoEstado);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Noticia no encontrada' };
  } catch(err) { return { ok: false, error: err.message }; }
}

function eliminarNoticia(id) {
  try {
    const sheet = obtenerHoja();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i+1);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Noticia no encontrada' };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ============================================================
//  LEER NOTICIAS
// ============================================================
function obtenerNoticiasPublicas() {
  return _leerNoticias('publicado');
}

function obtenerTodasLasNoticias() {
  return _leerNoticias(null);
}

function _leerNoticias(filtroEstado) {
  try {
    const sheet = obtenerHoja();
    const data  = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    const headers = data[0];
    const result  = [];
    for (let i = 1; i < data.length; i++) {
      const fila = {};
      headers.forEach((h, j) => { fila[h] = data[i][j]; });
      const estado = String(fila['Estado'] || '').trim().toLowerCase();
      if (!filtroEstado || estado === filtroEstado.toLowerCase()) {
        result.push({
          id:           String(fila['ID']            || ''),
          titulo:       String(fila['Título']         || ''),
          subtitulo:    String(fila['Subtítulo']      || ''),
          categoria:    String(fila['Categoría']      || ''),
          autor:        String(fila['Autor']          || ''),
          tipo:         String(fila['Tipo']           || 'texto'),
          fecha:        String(fila['Fecha']          || ''),
          mes:          String(fila['Mes']            || ''),
          estado:       estado,
          urlDocumento: String(fila['URL Documento']  || ''),
          portada:      String(fila['URL Portada']    || ''),
          urlMultimedia:String(fila['URL Multimedia'] || '')
        });
      }
    }
    return result.reverse();
  } catch(err) { return []; }
}

// ============================================================
//  ESTADÍSTICAS
// ============================================================
function obtenerEstadisticas() {
  try {
    const noticias   = _leerNoticias(null);
    const publicadas = noticias.filter(n => n.estado === 'publicado').length;
    const borradores = noticias.filter(n => n.estado === 'borrador').length;
    const porCategoria = {}, porMes = {};
    noticias.forEach(n => {
      porCategoria[n.categoria] = (porCategoria[n.categoria] || 0) + 1;
      porMes[n.mes]             = (porMes[n.mes]             || 0) + 1;
    });
    return { total: noticias.length, publicadas, borradores, porCategoria, porMes };
  } catch(err) { return null; }
}

// ============================================================
//  OBTENER TEXTO NOTICIA
// ============================================================
function obtenerTextoNoticia(urlDocumento) {
  try {
    const match = urlDocumento.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return '';
    return DocumentApp.openById(match[1]).getBody().getText();
  } catch(err) { return ''; }
}

// ============================================================
//  LEER EVENTOS DEL CALENDARIO
//
//  Lee el archivo calendario_cima.ics guardado en la carpeta
//  del periódico en Drive. Angela genera ese archivo ejecutando
//  forzarCopiaCalendario() desde el editor de Apps Script.
//  Así la Web App no necesita scope de Calendar y el index
//  permanece público para todos.
// ============================================================
function obtenerEventosCalendario() {
  try {
    const carpeta  = DriveApp.getFolderById(PERIODICO_FOLDER_ID);
    const archivos = carpeta.getFilesByName('calendario_cima.ics');

    if (!archivos.hasNext()) {
      return {
        error: 'No hay copia del calendario. Angela debe ejecutar forzarCopiaCalendario() una vez desde el editor de Apps Script.'
      };
    }

    const icsText = archivos.next().getBlob().getDataAsString();
    if (!icsText || !icsText.includes('BEGIN:VCALENDAR')) {
      return { error: 'El archivo calendario_cima.ics no es válido.' };
    }

    const texto  = icsText.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'');
    const lineas = texto.split(/\r\n|\n|\r/);
    const eventos = [];
    let ev = null;

    for (const linea of lineas) {
      if (linea === 'BEGIN:VEVENT') {
        ev = { titulo:'', descripcion:'', uid:'', fecha:null };
        continue;
      }
      if (linea === 'END:VEVENT') {
        if (ev && ev.titulo && ev.fecha) eventos.push(ev);
        ev = null;
        continue;
      }
      if (!ev) continue;
      const ci = linea.indexOf(':');
      if (ci < 0) continue;
      const prop = linea.substring(0, ci).toUpperCase();
      const val  = linea.substring(ci + 1);
      if (prop === 'SUMMARY')
        ev.titulo = val.replace(/\\,/g,',').replace(/\\n/g,' ').trim();
      else if (prop === 'DESCRIPTION')
        ev.descripcion = val.replace(/\\n/g,' ').replace(/\\,/g,',').trim();
      else if (prop === 'UID')
        ev.uid = val.trim();
      else if (prop.startsWith('DTSTART')) {
        const v = val.includes(':') ? val.split(':').pop() : val;
        const y=parseInt(v.slice(0,4),10), m=parseInt(v.slice(4,6),10)-1, d=parseInt(v.slice(6,8),10);
        if (v.length===8) { ev.fecha = new Date(y,m,d,8,0,0); }
        else {
          const h=parseInt(v.slice(9,11),10)||0, mi=parseInt(v.slice(11,13),10)||0;
          ev.fecha = v.endsWith('Z') ? new Date(Date.UTC(y,m,d,h,mi,0)) : new Date(y,m,d,h,mi,0);
        }
      }
    }

    const ahora=new Date(), limite=new Date();
    limite.setDate(limite.getDate()+60);
    const vistos=new Set();

    return eventos
      .filter(ev => ev.fecha && ev.fecha>=ahora && ev.fecha<=limite)
      .filter(ev => {
        const k=ev.titulo+ev.fecha.toDateString();
        if(vistos.has(k))return false; vistos.add(k); return true;
      })
      .sort((a,b) => a.fecha-b.fecha)
      .slice(0,30)
      .map(ev => ({
        id:           ev.uid,
        titulo:       ev.titulo,
        descripcion:  ev.descripcion,
        fecha:        Utilities.formatDate(ev.fecha,'America/Bogota','yyyy-MM-dd'),
        fechaLegible: Utilities.formatDate(ev.fecha,'America/Bogota',"d 'de' MMMM 'de' yyyy"),
        calendario:   'Coordinación Académica · Fe y Alegría La Cima'
      }));

  } catch(err) {
    return { error: 'Error leyendo calendario: ' + err.message };
  }
}

// ============================================================
//  PARSER ICS (mantener para compatibilidad)
// ============================================================
function parsearICS(icsText) {
  const eventos  = [];
  const lineas   = icsText.replace(/\r\n /g, '').replace(/\r\n\t/g, '').split(/\r\n|\n|\r/);
  let evento     = null;
  lineas.forEach(linea => {
    if (linea === 'BEGIN:VEVENT') {
      evento = { titulo: '', descripcion: '', uid: '', fecha: null };
    } else if (linea === 'END:VEVENT') {
      if (evento && evento.fecha && evento.titulo) eventos.push(evento);
      evento = null;
    } else if (evento) {
      if (linea.startsWith('SUMMARY:')) {
        evento.titulo = linea.replace('SUMMARY:', '').trim();
      } else if (linea.startsWith('DESCRIPTION:')) {
        evento.descripcion = linea.replace('DESCRIPTION:', '').replace(/\\n/g, ' ').trim();
      } else if (linea.startsWith('UID:')) {
        evento.uid = linea.replace('UID:', '').trim();
      } else if (linea.startsWith('DTSTART')) {
        const valor = linea.split(':')[1];
        evento.fecha = parsearFechaICS(valor);
      }
    }
  });
  return eventos;
}

function parsearFechaICS(valor) {
  if (!valor) return null;
  valor = valor.trim();
  const year  = parseInt(valor.substring(0, 4));
  const month = parseInt(valor.substring(4, 6)) - 1;
  const day   = parseInt(valor.substring(6, 8));
  if (valor.length > 8) {
    const hour = parseInt(valor.substring(9, 11)) || 0;
    const min  = parseInt(valor.substring(11, 13)) || 0;
    return new Date(Date.UTC(year, month, day, hour, min));
  }
  return new Date(year, month, day);
}

// ============================================================
//  GENERAR NOTICIA CON IA (OpenRouter)
// ============================================================
function generarNoticiaConIA(evento) {
  try {
    let fechaParaPrompt = evento.fechaLegible || '';
    if (!fechaParaPrompt && evento.fecha) {
      try {
        var fechaObjeto = (typeof evento.fecha === 'string') ?
          new Date(evento.fecha.replace(/-/g, '\/')) : new Date(evento.fecha);
        fechaParaPrompt = Utilities.formatDate(fechaObjeto, 'America/Bogota', "d 'de' MMMM 'de' yyyy");
      } catch(e) { fechaParaPrompt = evento.fecha; }
    }
    if (!fechaParaPrompt) {
      fechaParaPrompt = Utilities.formatDate(new Date(), 'America/Bogota', "d 'de' MMMM 'de' yyyy");
    }

    const prompt = `Eres el redactor del periódico digital "La Cima" de la Institución Educativa Fe y Alegría La Cima en Medellín, Colombia. El periódico es para la comunidad educativa (estudiantes de primaria, padres y profesores).

Tienes este evento del calendario institucional:
- Título del evento: ${evento.titulo || 'Sin título'}
- Fecha: ${fechaParaPrompt}
- Descripción adicional: ${evento.descripcion || 'Sin descripción'}

Genera una noticia periodística breve y alegre para este evento. Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta (sin texto adicional, sin markdown, sin bloques de código):
{
  "titulo": "Título atractivo de la noticia (máximo 10 palabras)",
  "subtitulo": "Entradilla que resume el evento (máximo 20 palabras)",
  "cuerpo": "Cuerpo de la noticia de 3 párrafos. Usa lenguaje sencillo y positivo, apropiado para una comunidad escolar.",
  "categoria": "Una de estas exactamente: Noticias Generales, Académico, Deportes, Cultura y Arte, Comunidad, Reconocimientos, Proyectos, Directivas",
  "emojiTema": "Un solo emoji que represente el tema del evento"
}`;

    const key    = PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
    if (!key) throw new Error('Clave OpenRouter no configurada.');
    const modelo = PropertiesService.getScriptProperties().getProperty('OPENROUTER_MODEL') || 'google/gemma-4-31b-it:free';

    var httpCode, rawText, intentos = 0;
    do {
      if (intentos > 0) Utilities.sleep(5000);
      var response = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + key,
          'HTTP-Referer': 'https://feyalegrialacima.edu.co',
          'X-Title': 'Periodico La Cima'
        },
        payload: JSON.stringify({
          model: modelo,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 800,
          temperature: 0.7
        }),
        muteHttpExceptions: true
      });
      httpCode = response.getResponseCode();
      rawText  = response.getContentText();
      intentos++;
    } while (httpCode === 429 && intentos < 3);

    if (httpCode !== 200) {
      if (httpCode === 429) {
        encontrarModeloFuncional();
        return { ok: false, error: 'Modelo saturado. Intenta de nuevo en un momento.' };
      }
      let mensajeError = 'HTTP ' + httpCode;
      try { mensajeError = JSON.parse(rawText).error?.message || mensajeError; } catch(e) {}
      return { ok: false, error: 'OpenRouter error ' + httpCode + ': ' + mensajeError };
    }

    const json = JSON.parse(rawText);
    let texto = json.choices[0].message.content.trim();
    texto = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const noticia = JSON.parse(texto);
    return { ok: true, noticia };

  } catch(err) {
    return { ok: false, error: 'Error interno: ' + err.message };
  }
}

// ============================================================
//  CLAVE GEMINI
// ============================================================
function obtenerGeminiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Clave Gemini no configurada. Ejecuta guardarGeminiKey() en el editor.');
  return key;
}

function guardarGeminiKey(clave) {
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', clave);
  Logger.log('✅ Clave Gemini guardada correctamente.');
}

// ============================================================
//  UTILIDADES
// ============================================================
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function sanitizarNombre(nombre) {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9 _-]/g,'')
    .replace(/\s+/g,'-')
    .substring(0,80);
}

// ============================================================
//  FORZAR COPIA CALENDARIO
//  Angela ejecuta esta función manualmente desde el editor
//  de Apps Script cuando quiera actualizar los eventos.
//  También se puede programar con crearTriggerCalendario().
// ============================================================
function forzarCopiaCalendario() {
  const carpeta = DriveApp.getFolderById(PERIODICO_FOLDER_ID);
  const cal = CalendarApp.getCalendarById('coordacademica@feyalegrialacima.edu.co');

  if (!cal) { Logger.log('❌ Calendario no encontrado'); return; }

  const ahora = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + 60);
  const eventos = cal.getEvents(ahora, limite);
  Logger.log('Eventos encontrados: ' + eventos.length);

  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//LaCima//ES\r\n';
  eventos.forEach(ev => {
    const inicio = Utilities.formatDate(ev.getStartTime(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
    const titulo = (ev.getTitle()||'Sin título').replace(/,/g,'\\,').replace(/\n/g,'\\n');
    const desc   = (ev.getDescription()||'').replace(/,/g,'\\,').replace(/\n/g,'\\n');
    ics += 'BEGIN:VEVENT\r\nDTSTART:' + inicio + '\r\nSUMMARY:' + titulo + '\r\n';
    if (desc) ics += 'DESCRIPTION:' + desc + '\r\n';
    ics += 'UID:' + ev.getId() + '\r\nEND:VEVENT\r\n';
  });
  ics += 'END:VCALENDAR';

  const existentes = carpeta.getFilesByName('calendario_cima.ics');
  if (existentes.hasNext()) {
    existentes.next().setContent(ics);
    Logger.log('✅ Copia actualizada en Drive');
  } else {
    carpeta.createFile('calendario_cima.ics', ics, 'text/calendar');
    Logger.log('✅ Copia creada en Drive');
  }
}

function crearTriggerCalendario() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'forzarCopiaCalendario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('forzarCopiaCalendario')
    .timeBased().everyDays(1).atHour(6).create();
  Logger.log('✅ Trigger diario creado');
}

function diagnosticar() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Noticias');
    Logger.log('Spreadsheet OK: ' + ss.getName());
    Logger.log('Hoja: ' + (sheet ? 'encontrada, filas=' + sheet.getLastRow() : 'NO existe'));
    const raiz = DriveApp.getFolderById(PERIODICO_FOLDER_ID);
    Logger.log('Carpeta Drive OK: ' + raiz.getName());
    const keyOk = !!PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
    Logger.log('Clave OpenRouter: ' + (keyOk ? 'configurada ✅' : 'NO configurada ❌'));
    const icsOk = raiz.getFilesByName('calendario_cima.ics').hasNext();
    Logger.log('calendario_cima.ics: ' + (icsOk ? 'existe ✅' : 'NO existe ❌ — ejecuta forzarCopiaCalendario()'));
  } catch(err) {
    Logger.log('ERROR: ' + err.message);
  }
}

function guardarOpenRouterKey() {
  PropertiesService.getScriptProperties().setProperty(
    'OPENROUTER_API_KEY',
    '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'
  );
  Logger.log('✅ Key guardada');
}

function encontrarModeloFuncional() {
  const key = PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
  const modelos = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'deepseek/deepseek-v4-flash:free',
    'google/gemma-4-26b-a4b-it:free',
    'google/gemma-4-31b-it:free',
    'openai/gpt-oss-20b:free',
    'openai/gpt-oss-120b:free',
    'qwen/qwen3-coder:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'liquid/lfm-2.5-1.2b-instruct:free'
  ];
  for (var i = 0; i < modelos.length; i++) {
    var modelo = modelos[i];
    Logger.log('Probando: ' + modelo);
    try {
      var res = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'post', contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + key, 'HTTP-Referer': 'https://feyalegrialacima.edu.co', 'X-Title': 'Periodico La Cima' },
        payload: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: 'Responde solo: OK' }], max_tokens: 10 }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        Logger.log('✅ FUNCIONA: ' + modelo);
        PropertiesService.getScriptProperties().setProperty('OPENROUTER_MODEL', modelo);
        return modelo;
      } else { Logger.log('❌ ' + res.getResponseCode() + ' — ' + modelo); }
    } catch(e) { Logger.log('❌ Error — ' + modelo + ': ' + e.message); }
    Utilities.sleep(500);
  }
  Logger.log('❌ Ningún modelo funcionó.');
  return null;
}

function testOpenRouter() {
  Utilities.sleep(3000);
  const res = generarNoticiaConIA({
    titulo: 'Día de la familia',
    fecha: '2025-05-30',
    fechaLegible: '30 de mayo de 2025',
    descripcion: 'Celebración con actividades para toda la comunidad'
  });
  Logger.log(JSON.stringify(res));
}

function diagnosticarCalendario() {
  const carpeta = DriveApp.getFolderById(PERIODICO_FOLDER_ID);
  const existe  = carpeta.getFilesByName('calendario_cima.ics').hasNext();
  Logger.log('calendario_cima.ics existe: ' + existe);
  if (existe) {
    const res = obtenerEventosCalendario();
    Logger.log('Eventos en el archivo: ' + (Array.isArray(res) ? res.length : JSON.stringify(res)));
    if (Array.isArray(res)) res.forEach(ev => Logger.log('  → ' + ev.titulo + ' | ' + ev.fechaLegible));
  }
}
