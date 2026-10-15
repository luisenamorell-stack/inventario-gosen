# StockMaster - Control de Inventario y Auditoría

Aplicación web completa construida en React, TypeScript y Tailwind CSS con servidor Node.js/Express e integración con Gemini AI para la gestión de retail, control de stock, auditoría física mediante escáner de códigos de barras, verificador de precios y directorio de proveedores.

## Módulos Principales

1. **Dashboard (Panel de Control)**:
   - Tarjetas de métricas clave: Total de Modelos, Unidades Físicas, Inversión en Stock (Lempiras `L`) y Alertas de Stock Bajo.
   - Gráfico de barras interactivo con distribución de stock por categoría.
   - Listado de productos críticos próximos a agotarse (con acceso directo a inventario).
   - Historial de auditorías recientes.

2. **Inventario (Catálogo de Productos)**:
   - Tabla completa con búsqueda en tiempo real por nombre, código o SKU.
   - Filtros por categoría y por proveedor.
   - Modal para crear y editar artículos con generación correlativa automática de códigos.
   - Indicadores de nivel de stock con código de colores.

3. **Conteo / Auditoría**:
   - Escáner de código de barras mediante cámara web/móvil y campo de entrada rápida por teclado.
   - Agrupación por modelo y comparación en tiempo real entre stock de sistema vs conteo físico.
   - Retroalimentación auditiva (beeps de éxito y error) sintetizada mediante Web Audio API.
   - Análisis inteligente de patrones y prevención de pérdidas con Gemini AI.
   - Resumen financiero de discrepancias con cálculo de impacto neto (ganancia/pérdida).
   - Aplicación de ajustes de stock directo al inventario y generación de reporte formal imprimible con firmas de auditor y gerencia.

4. **Consultar Precio (Price Checker)**:
   - Escaneo o ingreso de código con visor de precio destacado en Lempiras.
   - Cálculo del stock global del modelo sumando todas sus tallas.
   - Selector interactivo de tallas para verificar disponibilidad inmediata.

5. **Proveedores**:
   - Directorio de proveedores con enlaces directos a llamadas telefónicas y correo electrónico.
   - Conteo de artículos vinculados a cada proveedor.
   - Actualización en cascada en caso de cambio de nombre comercial.

## Tecnologías

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Chart.js, Canvas Confetti.
- **Backend / Proxy**: Express, tsx, Vite.
- **IA**: `@google/genai` (Gemini 3.8 Flash).
- **Escáner**: HTML5-QRCode.

## Ejecución

- Desarrollo: `npm run dev` (Inicia servidor en puerto 3000 con Vite HMR).
- Compilación: `npm run build`
