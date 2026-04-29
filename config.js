// ═══════════════════════════════════════════════════════
//  POS Licorería v2 — Configuración
//  Editar con cualquier editor de texto (Notepad, VS Code)
// ═══════════════════════════════════════════════════════
//
//  SHEETS_ID      → ID del Google Sheet (base de datos en la nube)
//                   URL: https://docs.google.com/spreadsheets/d/ [AQUI] /edit
//
//  SHEETS_API_KEY → Clave de API de Google Cloud (lectura)
//                   Google Cloud Console → APIs → Credenciales → Clave de API
//                   Habilitar: "Google Sheets API"
//
//  SHEETS_CLIENT_ID → ID de cliente OAuth 2.0 (escritura)
//                     Google Cloud Console → APIs → Credenciales → OAuth
//                     Habilitar: "Google Sheets API"
// ───────────────────────────────────────────────────────

var SHEETS_ID        = '1zbTJ2KEUP5CToewjBzTGoW9XGKS8UQwKcAED6HxY5Ls';
var SHEETS_API_KEY   = 'AIzaSyAOhGTjJXHhuUhqf1g2DPCla59xNzftb-Q';
var SHEETS_CLIENT_ID = '814005655098-8csk41qts3okv4b2fjnq7ls4qc2kq0vc.apps.googleusercontent.com';

// Los usuarios autorizados se gestionan en la pestaña "Usuarios" del Google Sheet
// columna A = Email | B = Nombre | C = Activo (si/no)
