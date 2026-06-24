// ═══════════════════════════════════════════════════════
//  POS Licorería — Configuración
//  Editar con cualquier editor de texto (Notepad, VS Code)
// ═══════════════════════════════════════════════════════
//
//  SHEETS_ID        → ID del Google Sheet (base de datos en la nube)
//                     URL: https://docs.google.com/spreadsheets/d/ [AQUI] /edit
//
//  SHEETS_API_KEY   → Clave de API de Google Cloud (solo lectura)
//                     Google Cloud Console → APIs → Credenciales → Clave de API
//                     Habilitar: "Google Sheets API"
//
//  APPS_SCRIPT_URL  → URL del Google Apps Script desplegado como Web App
//                     Apps Script → Implementar → Nueva implementación → Aplicación web
//                     Ejecutar como: Yo | Acceso: Cualquier usuario
// ───────────────────────────────────────────────────────

var SHEETS_ID       = '1zbTJ2KEUP5CToewjBzTGoW9XGKS8UQwKcAED6HxY5Ls';
var SHEETS_API_KEY  = 'AIzaSyAOhGTjJXHhuUhqf1g2DPCla59xNzftb-Q';
var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-yRZtwSOHhtSW_7Vz_bH5IJDMr8ecSfrLniEUQW7CeOozqj7pt2Sgv7aqekCxH40_/exec';

// ═══════════════════════════════════════════════════════
//  CUENTAS Y ROLES (§8-bis)
//  ⚠️ Control de conveniencia (UX), NO de seguridad real.
//     Cambia las contraseñas antes de usar en producción.
// ═══════════════════════════════════════════════════════
var CUENTAS = [
  { user: 'MIUSHA', pass: 'NeOs1552',     rol: 'admin',    nombre: 'MIUSHA' },
  { user: 'cajero', pass: 'CAMBIAR_CAJA', rol: 'empleado', nombre: 'Cajero' }
];

// Qué pestañas puede ver cada rol
var PERMISOS = {
  admin:    ['pos', 'productos', 'categorias', 'inventario', 'ventas', 'estadisticas'],
  empleado: ['pos', 'productos']
};
