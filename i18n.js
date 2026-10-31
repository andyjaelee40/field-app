// English / Spanish. t('English text', {vars}) returns the text in the chosen language; anything missing stays English.
// What people type (step names, items, notes) is never translated. Saves always go to the sheet in English.

var LANG = (function () {
  var q = new URLSearchParams(location.search).get('l'), saved = '';
  try { saved = localStorage.getItem('pcc_lang') || ''; } catch (e) {}
  if (q === 'es' || q === 'en') { try { localStorage.setItem('pcc_lang', q); localStorage.setItem('pcc_lang_set', '1'); } catch (e) {} return q; }
  return saved || (/^es\b/i.test(navigator.language || '') ? 'es' : 'en');
})();

function t(s, v) {
  var r = (LANG === 'es' && ES[s]) || s;
  return v ? r.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; }) : r;
}
// tn(3, 'day') -> "3 days" / "3 días"
var PL = {
  day: ['day', 'days', 'día', 'días'], item: ['item', 'items', 'artículo', 'artículos'], material: ['material', 'materials', 'material', 'materiales'],
  project: ['project', 'projects', 'proyecto', 'proyectos'], job: ['job', 'jobs', 'obra', 'obras'], update: ['update', 'updates', 'cambio', 'cambios'],
  'basic material': ['basic material', 'basic materials', 'material básico', 'materiales básicos']
};
function tn(n, w) { var p = PL[w] || [w, w + 's', w, w + 's'], es = LANG === 'es' ? 2 : 0; return n + ' ' + p[es + (n === 1 ? 0 : 1)]; }
function srvMsg(m) { return t(String(m || '')); }
function typeTxt(x) { return t(x); }
// "Tue 10/27" -> "mar 10/27"
var DAYS_ES = { Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb', Sun: 'dom' };
function dayTxt(s) { return LANG === 'es' ? String(s || '').replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, function (d) { return DAYS_ES[d]; }) : String(s || ''); }
// The reminders the sheet writes for My Work
var WHAT_ES = [
  [/^Step overdue \(due (.+)\)$/, 'Paso atrasado (era para el $1)'],
  [/^Materials land after this starts (.+)$/, 'Los materiales llegan después del inicio ($1)'],
  [/^STALE: Started, no update in (\d+) days$/, 'Empezado, sin cambios en $1 días'],
  [/^Should have started (.+)$/, 'Debió empezar el $1'],
  [/^In progress, due (.+)$/, 'En curso, para el $1'],
  [/^Starts (.+)$/, 'Empieza el $1'],
  [/^Delivery past ETA \((.+)\)$/, 'Entrega atrasada (llegaba el $1)'],
  [/^Arrives (.+), needed (.+)$/, 'Llega el $1, se necesita el $2'],
  [/^Order now, needed (.+)$/, 'Pedir ya, se necesita el $1'],
  [/^Delivery expected (.+)$/, 'Entrega esperada el $1'],
  [/^Decision late \(was due (.+)\)$/, 'Decisión atrasada (era para el $1)'],
  [/^Decide by (.+)$/, 'Decidir antes del $1'],
  [/^Needed on site (.+), not approved$/, 'Se necesita en obra el $1, sin aprobar'],
  [/^No budget entered yet: Projects > Set Budget$/, 'Falta el presupuesto: Projects > Set Budget']
];
function whatTxt(s) {
  s = String(s || '');
  if (LANG !== 'es') return s;
  for (var i = 0; i < WHAT_ES.length; i++) if (WHAT_ES[i][0].test(s)) return dayTxt(s.replace(WHAT_ES[i][0], WHAT_ES[i][1]));
  return dayTxt(s);
}

var ES = {
  // app frame
  'Undo': 'Deshacer', 'My Work': 'Mi trabajo', 'Add': 'Agregar', 'Projects': 'Proyectos', 'Field App': 'App de Obra',
  'No signal right now.': 'Sin señal ahora.', 'Error: {m}': 'Error: {m}',
  'Open the link Andy texted you to get started.': 'Abre el enlace que Andy te mandó por mensaje para empezar.',
  'Already have the link? Copy it from the text, paste it here and tap Start.': '¿Ya tienes el enlace? Cópialo del mensaje, pégalo aquí y toca Empezar.',
  'Paste your link': 'Pega tu enlace', 'Start': 'Empezar',
  'That is not a Field App link. Copy the whole link from the text.': 'Ese no es un enlace de la app. Copia el enlace completo del mensaje.',
  'Welcome': 'Bienvenido',
  'This app shows the work that needs you, on every project. It saves straight into the project sheet.': 'Esta app te muestra el trabajo que te toca en cada proyecto. Todo se guarda directo en la hoja del proyecto.',
  'One tap to update': 'Un toque para avisar',
  'Tap <b>Start</b> when you begin a step and <b>Done</b> when it is finished. Tapped the wrong one? Tap <b>Undo</b> at the bottom.': 'Toca <b>Empezar</b> cuando comiences un paso y <b>Listo</b> cuando lo termines. ¿Te equivocaste? Toca <b>Deshacer</b> abajo.',
  'No signal? Keep going': '¿Sin señal? Sigue trabajando',
  'Your updates and photos wait on the phone and send on their own when you have service.': 'Tus cambios y fotos esperan en el teléfono y se mandan solos cuando tengas señal.',
  'Got it': 'Entendido', 'Next': 'Siguiente', 'Skip': 'Saltar',
  'Already saved. Change it back on the step.': 'Ya se guardó. Cámbialo de nuevo en el paso.', 'Undone': 'Deshecho',
  'Still no signal. Your updates are safe on this phone.': 'Todavía sin señal. Tus cambios están seguros en este teléfono.',
  'Could not save "{x}": {m}': 'No se pudo guardar "{x}": {m}', 'No signal · {n} waiting': 'Sin señal · {n} en espera',
  'Saving…': 'Guardando…', 'Saved': 'Guardado', 'No signal.': 'Sin señal.', '{x} waiting on this phone.': '{x} esperando en este teléfono.',
  'Keep the app open until they send.': 'Deja la app abierta hasta que se manden.', 'They send on their own.': 'Se mandan solos.',
  'today': 'hoy', 'Up to date': 'Al día', 'No signal. Showing what was last loaded.': 'Sin señal. Mostrando lo último que se cargó.',
  'All projects': 'Todos los proyectos',
  // My Work
  'Step': 'Paso', 'Delivery': 'Entrega', 'Design': 'Diseño', 'Contract': 'Contrato', 'Payment': 'Pago', 'Budget': 'Presupuesto',
  'Hi {name}': 'Hola {name}',
  'No signal, and nothing saved on this phone yet. Open the app once with service first.': 'Sin señal y no hay nada guardado en este teléfono. Abre la app una vez con señal primero.',
  'Loading your work…': 'Cargando tu trabajo…', 'Mine': 'Mío', 'Everyone': 'Todos', 'Late': 'Atrasado', 'Needs a look': 'Revisar', 'This week': 'Esta semana',
  'Shopping list': 'Lista de compras', 'Everything to buy, on every job, by store': 'Todo lo que hay que comprar, de cada obra, por tienda',
  'to buy': 'por comprar', 'Nothing to buy right now': 'Nada que comprar ahora',
  'You’re all caught up': 'Estás al día', 'Nothing needs you right now.': 'No hay nada pendiente para ti.', 'Nothing needs anyone right now.': 'No hay nada pendiente para nadie.',
  'Practice: Example Project': 'Práctica: Proyecto de ejemplo', 'Safe to tap anything here. It is a practice project.': 'Aquí puedes tocar lo que quieras. Es un proyecto de práctica.',
  'Refresh': 'Actualizar', 'App version': 'Versión de la app', 'Mark done': 'Marcar listo', 'I got it': 'Ya lo tengo', 'Decide': 'Decidir',
  'Lien waiver received': 'Lien waiver recibido', 'Open project': 'Abrir proyecto', 'Started': 'Empezado', 'Running late, photo or note': 'Atraso, foto o nota',
  // shopping
  'No signal, and the list has not been loaded on this phone yet.': 'Sin señal y la lista todavía no se ha cargado en este teléfono.',
  'Loading…': 'Cargando…', 'Nothing to buy': 'Nada que comprar', 'Every material on every job is ordered or in hand.': 'Todo el material de cada obra ya está pedido o a la mano.',
  'All jobs': 'Todas las obras', 'Tap an item once it is in your cart. It is marked received on its job.': 'Toca un artículo cuando ya esté en tu carrito. Se marca como recibido en su obra.',
  'No store set': 'Sin tienda', 'qty': 'cant.', 'needed': 'se necesita', 'Bought': 'Comprado', '{x}: bought': '{x}: comprado',
  // projects
  'Archived': 'Archivado',
  'Andy can restore one for 90 days from the sheet: Projects menu, Restore Archived Project. Read-only copies stay in the Archive file for good.': 'Andy puede recuperar uno durante 90 días desde la hoja. Las copias de solo lectura se quedan en el archivo Archive.',
  'No projects yet': 'Todavía no hay proyectos', 'Tap <b>+ Add</b> to start one.': 'Toca <b>+ Agregar</b> para empezar uno.', 'Practice project': 'Proyecto de práctica', 'late': 'atrasados',
  'Steps': 'Pasos', 'Materials': 'Materiales', 'Photos': 'Fotos', 'Money': 'Dinero',
  'No signal, and this project has not been opened on this phone yet.': 'Sin señal y este proyecto todavía no se ha abierto en este teléfono.',
  'Archive this project': 'Archivar este proyecto', 'Archive {x}?': '¿Archivar {x}?', 'Use this when the job is finished or cancelled.': 'Úsalo cuando la obra esté terminada o cancelada.',
  'It comes off everyone’s phone, the Dashboard, This Week and the 7am email.': 'Sale del teléfono de todos, del Dashboard, de This Week y del correo de las 7am.',
  'A full copy is saved in the <b>Project Command Center Archive</b> file, and its final numbers go on the <b>Results</b> tab.': 'Se guarda una copia completa en el archivo <b>Project Command Center Archive</b> y sus números finales van a la pestaña <b>Results</b>.',
  'The Drive folder, photos and receipts stay where they are.': 'La carpeta de Drive, las fotos y los recibos se quedan donde están.',
  'You can’t undo this from the phone. For 90 days Andy can bring it back exactly as it was from the sheet (Projects menu, Restore Archived Project).': 'No se puede deshacer desde el teléfono. Durante 90 días Andy puede recuperarlo tal como estaba desde la hoja.',
  'Archive project': 'Archivar proyecto', 'Keep it': 'Mantenerlo', 'Takes about 20 seconds. Needs signal.': 'Tarda unos 20 segundos. Necesita señal.',
  'Wait for this project’s saves to finish first.': 'Espera a que terminen de guardarse los cambios de este proyecto.', 'Archiving… about 20 seconds': 'Archivando… unos 20 segundos', '"{x}" is archived': '"{x}" está archivado',
  // steps
  'Only mine': 'Solo los míos', 'Show done': 'Ver terminados', '{a} of {b} done': '{a} de {b} listos', 'All done': 'Todo listo', 'Nothing left to do here': 'Aquí no queda nada por hacer',
  'Uncheck Only mine to see everyone’s steps.': 'Quita Solo los míos para ver los pasos de todos.', 'Check Show done to see finished steps.': 'Marca Ver terminados para ver los pasos terminados.',
  'Done': 'Listo', 'delay': 'de atraso',
  // materials
  'Receipt or material': 'Recibo o material', 'Add from list': 'Agregar de la lista', 'Something else': 'Otra cosa', 'No materials yet': 'Todavía no hay materiales',
  'Start with the standard {x} list, then remove what this job doesn’t need in the sheet.': 'Empieza con la lista estándar de {x} y luego quita lo que esta obra no necesite.',
  'Add what this job needs.': 'Agrega lo que necesita esta obra.', 'Load the standard list ({n} items)': 'Cargar la lista estándar ({n} artículos)',
  'step': 'paso', 'arrives': 'llega', 'Installed': 'Instalado', 'In hand': 'A la mano', 'Ordered': 'Pedido', 'Still need': 'Falta', 'On the way': 'En camino',
  'Everything is in hand': 'Todo está a la mano', 'Add the rest of the standard list ({n})': 'Agregar el resto de la lista estándar ({n})', 'Edit the materials list': 'Editar la lista de materiales',
  '{x}: ordered': '{x}: pedido', 'The Materials List is empty. Add items on the Materials List tab in the sheet.': 'La lista de materiales está vacía.',
  'Nothing matches.': 'No hay resultados.', 'Already on this job': 'Ya está en esta obra', 'per': 'por', 'Quantity': 'Cantidad', 'Add {x}': 'Agregar {x}',
  'Pick materials': 'Elige materiales', 'Add materials': 'Agregar materiales', 'Standard': 'Estándar', 'All for this job': 'Todos para esta obra', 'Search all materials': 'Buscar en todos los materiales',
  'Adding…': 'Agregando…', 'Added {x}': 'Se agregaron {x}', '{n} already there': '{n} ya estaban', 'Those are already on this job': 'Esos ya están en esta obra',
  'Load the standard list?': '¿Cargar la lista estándar?',
  'Adds the <b>{x}</b> nearly every {type} job uses, as <b>Still need</b>, each linked to its step. Anything already on this job is skipped.': 'Agrega los <b>{x}</b> que usa casi toda obra de {type}, como <b>Falta</b>, cada uno con su paso. Lo que ya está en la obra se salta.',
  'Job-specific items (cabinets, roofing, windows…) are under <b>+ Add from list</b>, then All. Change what counts as standard with Edit the materials list.': 'Lo específico de cada obra (gabinetes, techo, ventanas…) está en <b>+ Agregar de la lista</b>, luego Todos.',
  'Not now': 'Ahora no', 'Rehab': 'Remodelación (rehab)', 'Standard for {x}': 'Estándar para {x}', 'Extra (not standard)': 'Extra (no estándar)', 'Materials List': 'Lista de materiales',
  'What the app offers on every job. Tap one to change it, or which project types start with it.': 'Lo que la app ofrece en cada obra. Toca uno para cambiarlo.',
  'New material': 'Material nuevo', 'Material': 'Material', '2x4 studs, tile, vanity…': 'Montantes 2x4, azulejo, mueble de baño…', 'Category': 'Categoría', 'Usual store': 'Tienda de siempre',
  'Unit': 'Unidad', 'each, sq ft, gallon…': 'pieza, pie², galón…', 'Unit cost ($)': 'Costo por unidad ($)', 'Which jobs use it?': '¿Qué obras lo usan?',
  'Pick the step it is for on each project type. Turn on Standard to load it onto every new job of that type.': 'Elige el paso para cada tipo de proyecto. Activa Estándar para cargarlo en cada obra nueva de ese tipo.',
  'Not used': 'No se usa', 'Save': 'Guardar', 'Remove from the list': 'Quitar de la lista', 'Back to the list': 'Volver a la lista',
  'To make it standard for a project type, pick its step there too.': 'Para hacerlo estándar en un tipo de proyecto, elige también su paso.', '{x} saved': '{x} guardado',
  'Tap again to remove {x}': 'Toca otra vez para quitar {x}', 'Removing…': 'Quitando…', '{x} removed from the list. Jobs that have it keep it.': '{x} se quitó de la lista. Las obras que lo tienen lo conservan.',
  // photos
  'Take a photo': 'Tomar una foto', 'Loading photos…': 'Cargando fotos…', 'No photos yet': 'Todavía no hay fotos', 'Photos taken in the app show up here by date.': 'Las fotos que tomes en la app aparecen aquí por fecha.',
  'Show older photos': 'Ver fotos anteriores', 'No signal. Photos load when you have service.': 'Sin señal. Las fotos cargan cuando tengas señal.', 'Photo': 'Foto',
  // design and money (owners)
  'No open design choices': 'No hay decisiones de diseño pendientes', 'Everything is decided.': 'Todo está decidido.', 'decide by': 'decidir antes del',
  'Log payment': 'Registrar pago', 'Contract / bid': 'Contrato / oferta', 'Spent': 'Gastado', 'Over': 'Pasado', 'Left': 'Queda',
  'No budget entered yet. Spent so far: <b>{x}</b>': 'Todavía no hay presupuesto. Gastado hasta ahora: <b>{x}</b>', 'Change the budget': 'Cambiar el presupuesto', 'Set the budget': 'Poner el presupuesto',
  'Lender still owes you back <b>{x}</b> on submitted draws.': 'El prestamista todavía te debe <b>{x}</b> de los draws enviados.', 'Signed work': 'Trabajo firmado', 'Signed': 'Firmado', 'Paid': 'Pagado',
  'Still owed': 'Por pagar', 'Contracts &amp; bids': 'Contratos y ofertas', 'No contracts or bids yet.': 'Todavía no hay contratos ni ofertas.', 'Company not set': 'Sin compañía', 'No status': 'Sin estado',
  'insurance until': 'seguro hasta', 'Amount': 'Monto', 'Owed': 'Debe', 'Replace file': 'Cambiar archivo', 'Attach file': 'Adjuntar archivo', 'Open file': 'Abrir archivo', 'Payments': 'Pagos',
  'latest 25': 'últimos 25', 'No payments logged yet.': 'Todavía no hay pagos.', 'No date': 'Sin fecha', 'draw': 'draw', 'paid back': 'reembolsado', 'lender owes': 'el prestamista debe',
  'Open receipt': 'Abrir recibo', 'Add receipt': 'Agregar recibo', 'One moment…': 'Un momento…', 'Total budget': 'Presupuesto total',
  'Whole dollars per step. Leave blank for steps with no cost.': 'Dólares enteros por paso. Deja en blanco los pasos sin costo.', 'Save budget': 'Guardar presupuesto', 'Budget saved: {x} total': 'Presupuesto guardado: {x} en total',
  // new project setup
  'Set up {x}': 'Preparar {x}', '1. Standard materials': '1. Materiales estándar',
  'Load the {n} basic materials nearly every {type} job uses, each linked to its step. You can add job-specific ones later.': 'Carga los {n} materiales básicos que usa casi toda obra de {type}, cada uno con su paso. Luego puedes agregar los específicos.',
  '2. Budget': '2. Presupuesto', 'Put in what each step should cost. This Week reminds you until a budget is in.': 'Pon cuánto debe costar cada paso. This Week te lo recuerda hasta que haya presupuesto.',
  'Later': 'Después', '3. Before photos': '3. Fotos de antes', 'Take a few photos of how the place looks today. They go to the project folder, by step.': 'Toma unas fotos de cómo se ve el lugar hoy. Van a la carpeta del proyecto, por paso.',
  'Take before photos': 'Tomar fotos de antes', '"{x}" is ready': '"{x}" está listo', 'Finish': 'Terminar',
  // step panel
  'Open the project first.': 'Abre el proyecto primero.', 'Not started': 'Sin empezar', 'Add a photo': 'Agregar una foto', 'Take or pick a photo': 'Toma o elige una foto',
  'Running late?': '¿Vas atrasado?', 'How many work days behind?': '¿Cuántos días de trabajo de atraso?', 'Why?': '¿Por qué?', 'What happened?': '¿Qué pasó?',
  'Pick how many days.': 'Elige cuántos días.', 'Pick a reason.': 'Elige una razón.', 'Delay': 'Atraso', '{x}: {d} late. Later steps move back.': '{x}: {d} de atraso. Los pasos siguientes se recorren.',
  'Save delay': 'Guardar atraso', 'Clear delay': 'Quitar atraso', 'Delay cleared. Later steps move back up.': 'Atraso quitado. Los pasos siguientes regresan.',
  'Caught up? Clear the {d} delay': '¿Ya te pusiste al día? Quita el atraso de {d}', 'Add a note': 'Agregar una nota', 'Anything the team should know': 'Lo que el equipo debe saber',
  'Type a note first.': 'Escribe una nota primero.', 'Note': 'Nota', 'Note saved': 'Nota guardada', 'Save note': 'Guardar nota',
  'Weather': 'Clima', 'Waiting on materials': 'Esperando materiales', 'Waiting on inspection': 'Esperando inspección', 'Crew or sub didn’t show': 'El equipo o subcontratista no llegó', 'Other': 'Otro',
  // receiving
  'Where is it now?': '¿Dónde está ahora?', 'Packing slip or receipt (optional)': 'Remisión o recibo (opcional)', 'Received': 'Recibido', '{x}: received': '{x}: recibido', 'Mark received': 'Marcar recibido',
  'now': 'ahora', 'Note (optional)': 'Nota (opcional)', 'Photo (optional)': 'Foto (opcional)', 'Decision': 'Decisión', 'Approve': 'Aprobar', 'Not yet': 'Todavía no', 'Reject': 'Rechazar',
  'Lien waiver': 'Lien waiver', 'Lien waiver marked received': 'Lien waiver marcado como recibido', 'Receipt': 'Recibo', 'Receipt saved. Sending now.': 'Recibo guardado. Mandándolo.',
  'Photo saved. It goes to the project folder.': 'Foto guardada. Va a la carpeta del proyecto.', 'That file is over 25 MB. Add it in Drive instead.': 'Ese archivo pesa más de 25 MB. Súbelo en Drive.',
  'Could not read that file.': 'No se pudo leer ese archivo.',
  // + Add
  'What do you want to add?': '¿Qué quieres agregar?', 'For {x}': 'Para {x}', 'Photo of a step': 'Foto de un paso', 'Saved to the project folder': 'Se guarda en la carpeta del proyecto',
  'Material or receipt': 'Material o recibo', 'Something you bought or ordered': 'Algo que compraste o pediste', 'Contractor, sub or fee paid': 'Pago a contratista, sub o cuota',
  'Contract or bid': 'Contrato u oferta', 'Photo or PDF of the paperwork': 'Foto o PDF del papeleo', 'New project': 'Proyecto nuevo', 'Makes the tab, folder and Dashboard row': 'Crea la pestaña, la carpeta y la fila del Dashboard',
  '{x}: which project?': '{x}: ¿qué proyecto?', 'Loading {x}…': 'Cargando {x}…', 'Photo for which step?': '¿Foto de qué paso?',
  'Project name (becomes the tab name)': 'Nombre del proyecto', 'Type': 'Tipo', 'Project manager': 'Encargado del proyecto', 'Address': 'Dirección', 'Target finish': 'Fecha meta',
  'Create project': 'Crear proyecto', 'Takes about 10 seconds. Needs signal.': 'Tarda unos 10 segundos. Necesita señal.', 'Enter a project name.': 'Escribe el nombre del proyecto.', 'Creating…': 'Creando…',
  'No contract': 'Sin contrato', 'owed': 'debe', 'Log a payment': 'Registrar un pago', 'Paid to': 'Pagado a', 'Company or person': 'Compañía o persona', 'Amount ($)': 'Monto ($)', 'Date paid': 'Fecha de pago',
  'Receipt or invoice (optional)': 'Recibo o factura (opcional)', 'More details (contract, method, lien waiver)': 'Más detalles (contrato, forma de pago, lien waiver)', 'Method': 'Forma de pago',
  'Lien waiver back?': '¿Llegó el lien waiver?', 'Check # / ref': 'Cheque # / ref', 'For step #': 'Para el paso #', 'Approved by': 'Aprobado por', 'Notes': 'Notas',
  'Materials you buy go under Material or receipt, not here.': 'Los materiales que compras van en Material o recibo, no aquí.', 'Enter who was paid.': 'Escribe a quién se le pagó.', 'Enter the amount.': 'Escribe el monto.',
  'Payment of {x} logged': 'Pago de {x} registrado', 'New contract or bid': 'Contrato u oferta nueva', 'The paperwork': 'El papeleo', 'Take a photo or pick a PDF': 'Toma una foto o elige un PDF',
  'Attach to': 'Adjuntar a', 'What is it for?': '¿Para qué es?', 'Roof replacement contract': 'Contrato de cambio de techo', 'Company': 'Compañía', 'Status': 'Estado', 'Insurance expires on': 'El seguro vence el',
  'You get a heads up 30 days before it lapses.': 'Te avisa 30 días antes de que venza.', 'Signed on': 'Firmado el', 'Save contract': 'Guardar contrato',
  'Take a photo or pick the file first.': 'Toma una foto o elige el archivo primero.', 'Say what the contract is for.': 'Di para qué es el contrato.', 'Contract saved. Sending now.': 'Contrato guardado. Mandándolo.',
  // receipts
  'Scan a receipt': 'Escanear un recibo', 'The app reads the store and total for you. Or fill it in below.': 'La app lee la tienda y el total por ti. O llénalo abajo.',
  'What is it?': '¿Qué es?', 'Total cost ($)': 'Costo total ($)', 'Where from?': '¿De dónde?', 'Is it here yet?': '¿Ya está aquí?', 'Have it': 'Ya lo tengo', 'Still need it': 'Todavía falta',
  'More details (category, where stored, step)': 'Más detalles (categoría, dónde se guarda, paso)', 'Stored at': 'Guardado en', 'Qty': 'Cant.', 'Room / area': 'Cuarto / área', 'Add material': 'Agregar material',
  'Reading the receipt…': 'Leyendo el recibo…', 'Receipt dated {x}': 'Recibo con fecha {x}', 'Receipt: {x}': 'Recibo: {x}',
  'Read it: {x}. Check it and fix anything that is off.': 'Leído: {x}. Revísalo y corrige lo que esté mal.',
  'Could not read this one. The photo is kept as the receipt; fill in the rest.': 'No se pudo leer. La foto se guarda como recibo; llena lo demás.',
  'No signal to read it now. The photo is kept as the receipt; fill in the rest.': 'Sin señal para leerlo ahora. La foto se guarda como recibo; llena lo demás.',
  'Say what the material is.': 'Di qué material es.', '{x} added': '{x} agregado',
  'Put this on your home screen: tap <b>Share</b> ⬆︎ then <b>Add to Home Screen</b>.': 'Ponla en tu pantalla de inicio: toca <b>Compartir</b> ⬆︎ y luego <b>Agregar a inicio</b>.',
  'Put the Field App on your home screen.': 'Pon la app en tu pantalla de inicio.', 'Put this on your home screen: tap <b>⋮</b>, then <b>Add to Home screen</b>.': 'Ponla en tu pantalla de inicio: toca <b>⋮</b> y luego <b>Agregar a la pantalla principal</b>.',
  'Install': 'Instalar',
  // labor and prices
  'Today: {x}': 'Hoy: {x}', 'half day': 'medio día', 'full day': 'día completo', 'Tap to change': 'Toca para cambiar', 'Where are you working today?': '¿Dónde trabajas hoy?',
  'Tap to check in. It counts your day on that job.': 'Toca para registrar tu llegada. Cuenta tu día en esa obra.', 'Labor this week': 'Mano de obra esta semana',
  'Who worked where, and what to pay': 'Quién trabajó dónde y cuánto pagar', 'How long?': '¿Cuánto tiempo?', 'Full day': 'Día completo', 'Half day': 'Medio día',
  'Pick the job.': 'Elige la obra.', 'Check in': 'Registrar', 'Checked in: {x}': 'Registrado: {x}', 'Worked two jobs today? Check in a half day at each.': '¿Trabajaste en dos obras hoy? Registra medio día en cada una.',
  'Labor': 'Mano de obra', 'Week of {x}': 'Semana del {x}', 'Last week': 'Semana pasada', 'Next week': 'Semana siguiente', 'Still to pay': 'Por pagar',
  'No day rate on the Team tab for: {x}. Their days count, but cost $0 until you add one.': 'Sin pago por día en la pestaña Team para: {x}.',
  'Pay each person': 'Pago por persona', '{d} days': '{d} días', 'Nobody checked in this week yet.': 'Nadie se ha registrado esta semana.', 'By job': 'Por obra',
  '{d} crew days': '{d} días de equipo', 'Day by day': 'Día por día', 'paid': 'pagado', 'Add a day': 'Agregar un día', 'Tap again: mark {x} paid': 'Toca otra vez: marcar {x} pagado',
  'Mark this week paid': 'Marcar la semana pagada', 'Change this day': 'Cambiar este día', 'Who': 'Quién', 'Job': 'Obra', 'Date': 'Fecha', 'This day is already marked paid.': 'Este día ya está pagado.',
  'Remove this day': 'Quitar este día', 'Pick who.': 'Elige quién.', 'Pick the date.': 'Elige la fecha.', 'Tap again to remove': 'Toca otra vez para quitar',
  'Labor budget': 'Presupuesto de mano de obra', 'Labor spent': 'Mano de obra gastada', 'Crew days': 'Días de equipo', 'Labor is {x} over its budget.': 'La mano de obra va {x} sobre el presupuesto.',
  'Labor (crew days)': 'Mano de obra (días de equipo)', 'Bought: {x}': 'Comprado: {x}', 'Bought, no price yet': 'Comprado, sin precio todavía', 'Scan the receipt': 'Escanear el recibo',
  'What did it cost? ($)': '¿Cuánto costó? ($)', 'Receipt and price (optional)': 'Recibo y precio (opcional)', 'For something already on this job?': '¿Es para algo que ya está en esta obra?',
  'No, a new item': 'No, es algo nuevo', 'Mark received with this receipt': 'Marcar recibido con este recibo', 'That day is already paid. Ask Andy or a project manager to change it.': 'Ese día ya está pagado. Pídele a Andy o a un encargado que lo cambie.',
  'Pick someone from the Team tab.': 'Elige a alguien del equipo.',
  'Edit': 'Cambiar', 'Change {x}': 'Cambiar {x}', 'Change': 'Cambio', 'Remove': 'Quitar', 'Somewhere else': 'En otro lugar', 'Garage, site trailer, unit 2…': 'Garaje, tráiler de obra, unidad 2…',
  'Remove from this job': 'Quitar de esta obra', '{x} removed from this job': '{x} se quitó de esta obra', 'Edit store and storage place names': 'Cambiar nombres de tiendas y lugares',
  'Change the name, store or qty': 'Cambiar nombre, tienda o cantidad', 'Stores and storage places': 'Tiendas y lugares', 'Storage places': 'Lugares', 'Stores': 'Tiendas',
  'Where you buy materials. Renaming a store changes it on every job and on the Materials List.': 'Donde se compran los materiales. Cambiar el nombre lo cambia en todas las obras.',
  'Where materials are kept until they go in. Renaming a place changes it on every job.': 'Donde se guardan los materiales. Cambiar el nombre lo cambia en todas las obras.',
  'Add a store': 'Agregar una tienda', 'Add a place': 'Agregar un lugar', 'None yet.': 'Ninguno todavía.', 'Name': 'Nombre', 'Take off the list': 'Quitar de la lista',
  'Jobs that use it keep it. It just stops showing as a choice.': 'Las obras que lo usan lo conservan. Solo deja de salir como opción.', 'Enter a name.': 'Escribe un nombre.',
  'Renamed to {x}': 'Nuevo nombre: {x}',
  'This year so far': 'En lo que va del año', '$600 or more: may need a 1099': '$600 o más: puede necesitar un 1099',
  'If your phone asks, allow location: it only records how far you are from the job, once, when you check in.': 'Si tu teléfono pregunta, permite la ubicación: solo anota qué tan lejos estás de la obra, una vez, al registrarte.',
  'One receipt, several items': 'Un recibo, varias cosas', 'Split it across items and jobs': 'Repartirlo entre cosas y obras',
  'Progress report for a client or lender': 'Informe de avance para cliente o prestamista', 'Past jobs: about {x}': 'Obras anteriores: aprox. {x}',
  'Finished {type} jobs ({n}): budget about {b}, spent about {s}. {o} went over.': 'Obras terminadas de {type} ({n}): presupuesto aprox. {b}, gastado aprox. {s}. {o} se pasaron.',
  'Fill blank steps from past jobs': 'Llenar los pasos vacíos con obras anteriores', 'Filled {n}. Check them, then Save budget.': 'Se llenaron {n}. Revísalos y luego guarda el presupuesto.',
  'Progress report': 'Informe de avance', 'A PDF with progress by phase, what is coming up, and the before and latest photos. It is saved in the project folder (Reports).': 'Un PDF con el avance por fase, lo que sigue y las fotos de antes y las más recientes. Se guarda en la carpeta del proyecto (Reports).',
  'Include budget and spent (for a lender)': 'Incluir presupuesto y gastos (para el prestamista)', 'Make the PDF': 'Hacer el PDF', 'Making it…': 'Haciéndolo…',
  'Ready: {x}': 'Listo: {x}', 'Send it (text, email…)': 'Enviarlo (mensaje, correo…)', 'Open it': 'Abrirlo',
  'Text it': 'Mandar por mensaje', 'All ordered': 'Todo pedido', 'Tap again: {n} ordered': 'Toca otra vez: {n} pedidos', '{n} marked ordered': '{n} marcados como pedidos',
  'new': 'nuevo', 'Nothing picked yet. Tap the items below that are on this receipt.': 'Nada elegido todavía. Toca abajo las cosas que están en este recibo.',
  'Adds up to the receipt': 'Cuadra con el recibo', 'Left to split: {x}': 'Falta repartir: {x}', 'Total: {x}': 'Total: {x}', 'On this receipt': 'En este recibo',
  'Split the rest evenly': 'Repartir el resto por igual', 'Open items on every job': 'Pendientes en todas las obras', 'Something not on any list': 'Algo que no está en ninguna lista',
  'Project': 'Proyecto', 'Add to this receipt': 'Agregar a este recibo', 'Type the receipt total first, or scan it.': 'Escribe primero el total del recibo, o escanéalo.',
  'Pick what the receipt was for.': 'Elige para qué fue el recibo.', 'Type an amount for each item (0 is fine).': 'Escribe una cantidad para cada cosa (0 está bien).',
  'The items add up to {a}, the receipt says {b}.': 'Las cosas suman {a}, el recibo dice {b}.', 'Receipt split across {x}': 'Recibo repartido entre {x}', '{x} taken off the list': '{x} se quitó de la lista', 'Enter the material name.': 'Escribe el nombre del material.',
  // statuses and flags from the sheet
  'Not Started': 'Sin empezar', 'Complete': 'Listo', 'Needed': 'Falta', 'Quoted': 'Cotizado', 'Backordered': 'Pendiente del proveedor', 'Shipped': 'Enviado', 'Delivered': 'Entregado',
  'Returned': 'Devuelto', 'Cancelled': 'Cancelado', 'Idea': 'Idea', 'Pending Approval': 'Por aprobar', 'Approved': 'Aprobado', 'Rejected': 'Rechazado',
  'OVERDUE': 'ATRASADO', 'PAST ETA': 'NO HA LLEGADO', 'LATE FOR STEP': 'TARDE PARA EL PASO', 'ORDER NOW': 'PEDIR YA', 'MATERIALS LATE': 'MATERIAL ATRASADO', 'STALE': 'SIN CAMBIOS',
  'DECISION LATE': 'DECISIÓN ATRASADA', 'Decide soon': 'Decidir pronto', 'Needed soon': 'Se necesita pronto', 'Locked in': 'Decidido',
  // project types
  'Residential Rehab': 'Remodelación residencial', 'Renovation': 'Renovación', 'New Construction': 'Construcción nueva', 'Commercial': 'Comercial',
  // server messages
  'This link was turned off. Ask Andy for a new one.': 'Este enlace se desactivó. Pídele uno nuevo a Andy.',
  'This link is not set up. Ask Andy for your phone app link.': 'Este enlace no está listo. Pídele a Andy tu enlace de la app.',
  'You are not on the Team tab anymore. Ask Andy to add you back.': 'Ya no estás en la lista del equipo. Pídele a Andy que te agregue de nuevo.',
  'Ask Andy or a project manager to do that.': 'Pídele eso a Andy o a un encargado de proyecto.', 'Project not found.': 'No se encontró el proyecto.',
  'Could not find that line. Refresh and try again.': 'No se encontró esa línea. Actualiza e intenta otra vez.', 'This phone is not set up yet.': 'Este teléfono todavía no está listo.',
  'No photos yet.': 'Todavía no hay fotos.', 'That photo is not in this project.': 'Esa foto no es de este proyecto.', 'Take a photo of the receipt first.': 'Toma una foto del recibo primero.',
  'Something went wrong.': 'Algo salió mal.', 'No signal': 'Sin señal'
};
