# Sistema Administrativo de la Academia

Aplicación web para gestionar, organizar y registrar la parte administrativa de
una academia. **El alumno es el eje**: lleva su mensualidad, todo lo que se le
cobra y los trabajos que realiza con su costo aparte. Alrededor están los
profesores y su nómina, la librería con su personal, y el alquiler del local.

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Redux Toolkit + React Router 7 + Vite |
| Backend | Node.js 20 + Express + Mongoose |
| Base de datos | MongoDB 7 (local) / MongoDB Atlas (producción) |
| Documentación de API | Swagger (OpenAPI 3) con `swagger-jsdoc` + `swagger-ui-express` |
| Orquestación | Docker Compose |

---

## Los dos entornos

Hay **dos entornos separados**, cada uno con su `docker compose`. Lo que los
mantiene aparte es el nombre del proyecto (`acade-local` y `acade-prod`): cada
uno tiene sus contenedores, su red y sus volúmenes, así que pueden estar
levantados a la vez sin tocarse.

| | Local | Producción |
|---|---|---|
| Fichero | `docker-compose.yml` | `docker-compose.prod.yml` |
| Base | MongoDB en un contenedor | MongoDB Atlas |
| Imágenes | `dev` (nodemon, Vite, recarga en caliente) | `prod` (las que se despliegan) |
| Código | Montado desde el disco | Copiado dentro de la imagen |
| Panel de la base | mongo-express | — |
| Puertos | Solo `127.0.0.1` | Abiertos a la red |

La idea es que **en local puedas romper lo que quieras**. La dirección de la
base local está escrita a mano en el propio `docker-compose.yml` y no se lee
de ninguna variable: así este entorno no puede acabar apuntando a Atlas por un
descuido, que es justo el accidente que hay que evitar.

### Local

Requisitos: Docker Desktop en ejecución.

```bash
cp .env.example .env && docker compose up -d --build
```

La primera vez tarda unos minutos (descarga MongoDB e instala dependencias).
Cuando termine:

| Servicio | URL | Notas |
|---|---|---|
| Aplicación web | http://localhost:5173 | Interfaz administrativa |
| API REST | http://localhost:4000/api | |
| **Swagger** | **http://localhost:4000/api/docs** | Documentación interactiva |
| Spec OpenAPI | http://localhost:4000/api/docs.json | JSON crudo |
| mongo-express | http://localhost:8081 | Para mirar la base a ojo |
| MongoDB | localhost:27017 | Por si quieres conectar Compass |

Todos los puertos están atados a `127.0.0.1`: se ven desde tu equipo, no desde
el wifi de la academia.

#### El Mongo local es un *replica set* de un nodo

Parece un detalle y no lo es. **Mongo solo admite transacciones sobre un
replica set**, y hay tres operaciones que las necesitan:

| Operación | Qué pasaría a medias |
|---|---|
| Registrar una venta | Descuenta stock, crea la venta y sus renglones. El inventario mentiría |
| Inscribir un alumno | Crea el alumno y sus primeros cobros. Aparecería *Al día* sin haber pagado |
| Abonar una deuda | Reparte el abono entre varios recibos. Quedaría dinero aplicado a medias |

Atlas ya es un replica set, así que en producción funcionan solas. Si el
contenedor local fuera un Mongo suelto, estas tres operaciones fallarían
**solo en local**, que es la peor clase de diferencia entre entornos. Por eso
arranca con `--replSet rs0`, y el propio *healthcheck* lo inicializa la primera
vez.

La URI lleva `directConnection=true` para que el driver no intente descubrir el
nodo por el nombre que éste anuncia: hay uno solo y ya sabemos cuál.

### Comprobar que todo funciona

```bash
cd backend && npm run probar:api
```

Levanta la API contra una base de pruebas aparte —que borra al terminar—,
entra con las dos cuentas y recorre el sistema entero: alta de alumnos con sus
cobros, abonos parciales y totales, una venta que descuenta stock, una venta
sin stock que se deshace entera, nómina, el panel cuadrando sus cifras, los
permisos de cada rol, la pantalla de actividad, anular y restaurar, y la
emisión automática de mensualidades.

### Producción

```bash
cp .env.production.example .env.production
```

Rellena la cadena de Atlas y los secretos, y levántalo:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Sirve para **ensayar un despliegue antes de hacerlo**: son las mismas imágenes
que corren en el servidor, así que lo que funcione aquí funciona allí. Si falta
cualquier variable obligatoria, el arranque se para y dice cuál: no se inventa
una base local.

Para apagarlo sin tocar el entorno local:

```bash
docker compose -f docker-compose.prod.yml down
```

### Nadie borra producción por error

Las órdenes que **destruyen datos** —restaurar el seed, recargarlo— comprueban
antes contra qué base van. Si no es local, se paran y lo explican.

Existe por un accidente concreto y fácil de tener: abrir una terminal que
todavía tiene cargadas las variables de producción y lanzar `npm run
seed:restore`, que borra todo y recarga el fichero. Contra la base de la
academia eso es perder los cobros de verdad.

Si alguna vez hace falta de verdad —restaurar un respaldo tras un desastre—
hay que decirlo a propósito:

```bash
PERMITIR_BASE_REMOTA=true npm run seed:restore
```

Los mensajes nunca muestran la contraseña: la cadena de Atlas la lleva dentro,
así que se imprime sin credenciales.

---

## Primer arranque

Si es la primera vez, la base arranca vacía y el sistema solo crea el usuario
administrador para que puedas entrar. Si ya tienes un seed guardado (ver más
abajo), se carga solo.

```
admin@academia.com  /  Admin123*
```

Cámbialo en el archivo `.env` (`ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
antes del primer arranque. A partir de ahí, todos los datos los cargas tú desde
la aplicación.

### Comandos útiles

Ver los logs del backend:

```bash
docker compose logs -f backend
```

Detener todo sin borrar datos:

```bash
docker compose down
```

Borrar también la base de datos y empezar de cero:

```bash
docker compose down -v
```

Recrear el usuario administrador (si lo borraste por error):

```bash
docker compose exec backend npm run bootstrap
```

---

## Guardar y recuperar los datos

`docker compose down` **no borra nada**: los datos viven en un volumen de
Docker y siguen ahí al volver a levantar. Solo `down -v` los elimina.

Aun así, conviene tener una copia fuera del volumen. Para eso está el seed:

```bash
docker compose exec backend npm run seed
```

Guarda todo lo cargado (alumnos, profesores, cobros, nómina, trabajos,
librería y alquiler) en `backend/src/seed/data.json`, que está en tu disco,
no en el volumen. **Cuando el backend arranca y encuentra la base vacía, carga
ese archivo automáticamente.** Así, aunque borres el volumen o muevas el
proyecto a otra máquina, los datos vuelven solos.

Nunca pisa lo que ya existe: si la base tiene registros, el seed no se aplica.
Para forzarlo:

```bash
docker compose exec backend npm run seed:load      # agrega lo que falte
docker compose exec backend npm run seed:restore   # borra y restaura
```

El archivo es JSON legible, así que puedes versionarlo o editarlo a mano. Los
usuarios quedan fuera a propósito: el administrador se crea desde el `.env` y
no tiene sentido volcar contraseñas a un archivo del repositorio.

Si prefieres arrancar siempre en blanco, pon `SEED_ON_START=false`.

---

## El mes de trabajo

En la cabecera, al lado del usuario, hay un selector de **mes y año**. Manda
sobre toda la aplicación: lo que resume el panel, los cobros que lista Pagos y
el período que proponen *Generar mensualidades*, *Generar nómina*, *Emitir el
alquiler* y *emitir la mensualidad* desde la ficha de un alumno.

Existe porque un mes no se cierra el día 1: al entrar octubre se siguen
registrando cobros de septiembre. En vez de pelear con el calendario, se elige
el mes una vez y todas las secciones hablan de él.

Arranca en el mes **del servidor**, no en el del navegador —la academia puede
estar en otra zona horaria—, y si se elige un mes distinto al actual el
selector se pinta en naranja con un enlace para volver, para que nadie registre
en septiembre creyendo que está en octubre.

### La fecha de hoy

Todo lo que la aplicación fecha sola —cuándo se cobró, de qué mes es un recibo
nuevo— usa la fecha en la zona de la academia (`TZ`, por defecto
`America/Caracas`), no la UTC.

No es un detalle: `new Date().toISOString()` devuelve UTC, y Venezuela va
cuatro horas por detrás, así que **a partir de las 20:00 locales el UTC ya está
en el día siguiente**. Trabajando de noche eso fechaba los cobros un día
después, y a fin de mes los mandaba al mes siguiente. Ver
`backend/src/utils/today.js`.

---

## Qué resuelve cada módulo

### Alumnos
Es el módulo central, y a propósito es breve: nombre (lo único obligatorio),
apellido, cédula, grado, mensualidad y estado.

La mensualidad se elige de un desplegable con el **precio base** de la academia
(70 por defecto, configurable en `BASE_MONTHLY_FEE`), *Sin mensualidad*, o
*Otro monto* para escribir una cifra libre.

**Al registrarlo se emiten sus primeros cobros.** Un alumno nuevo casi nunca
está al día —lo normal es que entre debiendo—, así que el alta pregunta dos
cosas, y cada una admite *Pendiente de pago*, *Ya la pagó* o *No emitir cobro*:

- **Mensualidad de este mes**: emite el recibo del mes en curso por su
  mensualidad pactada.
- **Inscripción**: emite un recibo aparte por el monto que indiques. Déjalo en
  0 si no cobras inscripción, o fija el habitual en `BASE_ENROLLMENT_FEE` para
  que venga propuesto.

Estos dos campos solo aparecen al crear; al editar un alumno no se ve ninguno,
porque ahí ya no tiene sentido emitir nada.

El listado muestra en la columna **Deuda** lo que cada alumno debe, cuántos
cobros tiene abiertos y cuánto de eso está vencido; quien no debe nada aparece
como *Al día*, y quien ya entregó algo lo dice —*Abonó 35 de 70*—.

La columna de cobro y el desplegable de **cobranza** hablan **del mes elegido
en la cabecera**, no del acumulado: la pregunta útil es quién pagó septiembre,
no cuánto debe alguien desde que entró.

| | |
|---|---|
| **Pagado** | Se le emitió el cobro del mes y no debe nada |
| **Falta por pagar** | Debe y no ha entregado nada |
| **Pagó una parte** | Debe, pero ya abonó algo |
| **Sin cobro emitido** | Ese mes no tiene recibo: ni debe ni está al día |

La última columna se llama **Matrícula**, no *Estado*: ahí *Activo* significa
que el alumno sigue inscrito, y se confundía con que hubiera pagado.

Ese último estado existe a propósito. Sin recibo emitido no se puede afirmar
que alguien esté al día —antes salían todos en verde el día 1 del mes—, y es
justo la lista que hace falta para saber a quién emitirle.

Se resuelve contra los cobros, no contra una columna del alumno, así que se
combina con la búsqueda y el estado, y la paginación cuenta bien. El filtro y
la etiqueta de cada fila usan exactamente la misma regla, de modo que los
grupos siempre suman el total.

El nombre es un enlace al **estado de cuenta**, que abre en una
sola vista todo lo facturado, lo abonado, el saldo, la mora, el historial
completo de cobros —cada uno con su **referencia** y su método de pago— y los
trabajos con su costo y margen. Ahí es donde se revisan los comprobantes de una
persona sin ir cobro por cobro.

La celda de **Deuda** es editable: al pulsarla se abre el estado de pago del
alumno, con cada cobro y un interruptor Pagado/Pendiente. Sirve tanto para
confirmar lo que sí pagaron como para **revertir** algo marcado por error. Si
todavía no tiene ningún cobro emitido —por eso aparece *Al día*—, el mismo
modal ofrece **emitir la mensualidad** del mes que elijas.

Cuando hay deuda aparece un **botón verde** que abre *Registrar pago*. Viene
con la deuda entera escrita, así que si paga todo basta confirmar; si trae
menos se cambia la cantidad y queda un **abono parcial**, repartido entre sus
cobros más antiguos primero. El botón cambia de texto —*Pago completo* o
*Registrar abono*— según lo que se escriba, y avisa cuánto quedaría debiendo.

### Profesores
Lo único obligatorio es el nombre; apellido, cédula, teléfono, correo y
dirección son opcionales.

Por defecto cobran **por alumno, a la semana**: se indica cuántos alumnos
tienen, su tarifa (5 $ por defecto, en `BASE_STUDENT_RATE`) y cuántas horas de
clase dan a la semana. El resto **se calcula solo** y se ve en vivo mientras
escribes:

```
pago semanal    = alumnos × tarifa           10 × 5 $   =  50 $
sueldo mensual  = pago semanal × 4 semanas   50 $ × 4   = 200 $
pago por día    = pago semanal ÷ 5 días      50 $ ÷ 5   =  10 $
tarifa por hora = pago semanal ÷ horas       50 $ ÷ 4 h =  12,50 $
```

Las semanas por mes se ajustan en `WEEKS_PER_MONTH` y los días de clase por
semana en `DAYS_PER_WEEK`. Si cambias los alumnos, la tarifa o las horas, los
cuatro valores se recalculan al guardar. También quedan disponibles los
contratos de salario fijo, por hora y por honorarios, donde el
sueldo se escribe a mano.

Su ficha muestra el historial de pagos, lo devengado, lo pagado y el saldo
pendiente.

### Pagos
Es el corazón del sistema. Cada cobro se registra a nombre de un alumno y guarda
monto, descuento, recargo por mora, monto abonado, método, referencia, período
y fechas. **Todo es modificable** y el estado
(pendiente / parcial / pagado / vencido) se recalcula solo al guardar.

El listado trae una columna de **Referencia** con el número del comprobante y el
método, y el buscador encuentra por esa referencia: si el banco te da un número
suelto, lo pegas ahí y sale el cobro al que pertenece. El filtro por alumno
muestra todo lo suyo, y desde el estado de cuenta el enlace *Editar sus cobros*
lleva aquí con ese filtro ya puesto.

Cada fila se corrige con el **lápiz** de la columna Acciones, que abre el cobro
completo: monto, descuento, mora, abonado, método, referencia y período. Esa
columna queda anclada al borde derecho, así que no se pierde de vista aunque la
tabla sea más ancha que la pantalla.

- **Abonos**: se registran sumando al monto abonado, sin perder el historial.
- **Anulación**: un recibo se anula en vez de borrarse, así queda la traza; se
  puede restaurar.
- **Generar mensualidades**: crea de un golpe el recibo del mes para todos los
  alumnos activos que tengan una mensualidad pactada, omitiendo los ya emitidos.
  Normalmente no hace falta usarlo —el mes en curso se emite solo, ver abajo—;
  queda para emitir un mes pasado o para rehacerlo tras cambiar mensualidades.

#### El mes empieza con todos en pendiente
Un alumno activo **debe su mes desde que el mes empieza**, no desde que alguien
le pasa el recibo. Si el cobro no existe, el alumno aparece *Al día* sin haber
pagado nada, que es justo lo contrario de lo que pasa.

Así que al entrar un mes nuevo la mensualidad **se emite sola** a todos los
alumnos activos con mensualidad pactada: todos arrancan en *Pendiente* y van
saliendo de ahí a medida que pagan. No hay que pulsar nada.

La emisión corre al arrancar la API y se vuelve a comprobar cada
`AUTO_CHARGES_CHECK_HOURS` horas, porque el contenedor puede llevar semanas
levantado y cruzar el cambio de mes sin reiniciarse. Es **idempotente**: salta a
quien ya tenga el cobro del período, así que repetirla no duplica nada.

Dos cosas que no emite a propósito:

- Un mes **anterior al alta** del alumno. Quien entró en octubre no debe
  septiembre.
- Un mes **anterior a `ACADEMY_START_DATE`**, el arranque de la academia.

Se puede apagar con `AUTO_MONTHLY_CHARGES=false` y emitir solo a mano. El botón
*Generar mensualidades* usa el mismo servicio, de forma que lo automático y lo
manual no pueden llegar a reglas distintas.

Los cuatro indicadores de arriba parten el mismo dinero en dos mitades que
**suman lo facturado**, para que se puedan cuadrar de un vistazo:

| | |
|---|---|
| **Facturado** | Todo lo emitido (los anulados quedan fuera) |
| **Cobrado** | Lo que ya entró: recibos pagados + abonos sobre los parciales |
| **Por cobrar** | Lo que falta, en todos los recibos abiertos |
| **En mora** | De lo por cobrar, la parte que ya venció |

```
cobrado + por cobrar = facturado
```

Antes había un *Abonos parciales* junto a un *Saldo pendiente* y no se
distinguía cuál era dinero recibido y cuál dinero que deben; además el saldo
dejaba fuera lo vencido, así que las cifras no cuadraban con nada.

Ojo con una diferencia que es real y no un error: estas cifras son el
**histórico**, mientras que *Ingresos del mes* del panel cuenta solo lo cobrado
**con fecha de pago dentro del mes**. Si no coinciden, lo normal es que haya
dinero cobrado en otro período —o un recibo sin fecha de pago—.

### Nómina
Dos pestañas, porque hay dos grupos que cobran con la misma regla:
**Docentes** y **Librería**. Las dos suman en los totales de nómina del panel.

#### Docentes
Mismo modelo de recibos, pero para profesores. El recibo se arma con **las
semanas que cubre por el pago semanal del profesor**, que es justo como se
pactó el sueldo:

```
monto del recibo = semanas × pago semanal      2 × 50 $ = 100 $
total            = monto + bonos − deducciones
```

Al elegir el profesor, su **pago semanal se rellena solo** con lo que tenga
calculado (alumnos × tarifa), y al elegir el periodo se proponen las semanas
que le corresponden. El recuadro *Así queda el recibo* muestra en vivo el
monto, el total y lo que queda por pagar. Sobre eso se registran abonos con el
botón de pago, igual que en las mensualidades.

El botón **Generar nómina** crea de un golpe los recibos del periodo para los
profesores activos que cobran por alumno o tienen sueldo fijo, omitiendo los ya
emitidos. Los de por hora u honorarios se cargan a mano.

**El mes de apertura no se paga completo.** `ACADEMY_START_DATE` marca el día en
que arrancó la academia y la nómina de ese mes sale con las semanas realmente
trabajadas. Con el arranque a mediados de septiembre de 2026, ese periodo se
emite con **2 semanas** y los siguientes con 4; los meses anteriores al arranque
se rechazan. El número se puede cambiar a mano antes de generar.

#### Librería
El pago al personal de la librería funciona exactamente igual —semanas ×
pago semanal, misma vista, mismos abonos y anulaciones—, solo que los recibos
son **LIB-000001** en vez de NOM-, el método por defecto es efectivo y el pago
semanal lo trae el trabajador según lo que tenga pactado (ver *Librería >
Personal*). **Generar nómina** emite el recibo del periodo para todo el
personal activo.

Las dos nóminas se suman donde importa: la tarjeta de **nómina del mes** del
panel, el gráfico anual de flujo y el total a pagar cuentan lo que se paga a
profesores y lo que se paga en la librería.

### Pagos personales
Dinero que sale de la caja **para el bolsillo, no para el negocio**: un retiro,
una compra personal, lo que sea. Cada registro lleva fecha, concepto,
categoría, monto, moneda, método y referencia; no tiene estados ni saldos
porque se anota cuando ya ocurrió.

Lo importante es cómo cuenta: **no reduce la ganancia del negocio**. Un retiro
no es un gasto de la academia, es un reparto de lo que ganó, así que la
ganancia sigue siendo la misma y los retiros se muestran aparte con lo que
queda de ella:

```
ganancia  = cobrado + ganancia de librería − nómina − alquiler
queda     = ganancia − retiros personales
```

Ese *queda* es el mismo **neto** que el panel muestra en *Cuentas del mes*,
donde el cálculo aparece completo con todos los gastos agrupados.

Casi todos los meses se repiten los mismos gastos, así que el botón **Renovar
los del mes anterior** los propone en una lista con todo marcado: se desmarca
lo que no se repita y se copian al mes elegido conservando el día. Lo que ya
tenga un gasto del mismo concepto ese mes viene desmarcado y avisado, para no
duplicarlo.

Se puede retirar de cualquiera de las dos cajas —dólares o bolívares—; lo que
salga en Bs se pasa con la tasa del BCV para poder sumarlo. El panel lo
resume en la tarjeta **Retiros del mes**, que dice cuánto se sacó y cuánto
queda.

### Trabajos de alumnos
Cada trabajo registra por separado lo que **cuesta** a la academia (materiales +
mano de obra) y lo que se **cobra**, con su margen y su saldo.
Desde la fila se puede registrar un abono o **emitir el cobro**, que genera un
pago enlazado en el módulo de pagos y mantiene ambos registros sincronizados.

### Librería
**La librería cobra en bolívares.** Los productos y las ventas van siempre en
Bs, mientras que las mensualidades, los trabajos y la nómina —incluida la del
personal de la librería— siguen en la moneda base. Arriba de las pestañas
aparece la **tasa oficial del BCV del día**, con su fecha y un botón para
volver a consultarla.

La tasa se lee **directamente de bcv.org.ve**, del mismo recuadro que ves en su
portada, con su *fecha valor*.

Hay un detalle técnico que vale la pena dejar escrito: el BCV sirve un
certificado válido de Sectigo pero **no envía el certificado intermedio**, así
que la verificación TLS falla con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. La
solución fácil sería desactivar la verificación, pero eso permitiría que
cualquiera se hiciera pasar por el banco. En vez de eso se le aporta el
intermedio que falta (`backend/src/services/certs/`) y la cadena se valida de
verdad contra la raíz de Sectigo. Ese certificado vence en 2036; si alguna vez
el BCV cambia de emisor habrá que reemplazarlo.

Si el BCV no responde se recurre a `EXCHANGE_RATE_URL`, un espejo que publica la
misma tasa oficial —puede ir un par de días atrasado, y cuando se usa la barra
lo dice—. Se guarda en caché unas horas (`EXCHANGE_RATE_TTL_MINUTES`) y, si
ninguna de las dos responde, se muestra la última conocida marcada en naranja;
si nunca se pudo traer dice *No disponible* y la aplicación sigue funcionando.

Donde hace falta juntar las dos monedas —la **deuda total** del panel— la parte
de la librería se convierte con esa tasa y una nota al pie dice con cuál. Si no
hay tasa, esa parte queda fuera del total y la nota lo advierte, que es
preferible a sumar bolívares con dólares.

Cuatro pestañas. En **Productos** está el inventario: cada artículo con su costo,
su precio, su margen, su stock y un mínimo por debajo del cual se marca como
*Reponer*. El botón de ajuste registra entradas y salidas (compras al
proveedor, mermas) sin pasar por una venta.

En **Ventas** se registran los pagos de la librería. Una venta lleva varios
artículos, puede ir a nombre de un alumno o al público, admite descuento y
admite quedar a crédito con abonos.

**El precio que escribes manda.** El precio de lista por producto es solo un
punto de partida: una impresión a color no cuesta lo mismo según cuánto color
lleve. Si el importe de *Precio cobrado al cliente* no coincide con la suma de
los renglones, vale el que escribiste —sin errores ni avisos— y la diferencia
se guarda como **recargo** o **descuento**, según sea mayor o menor. Los
renglones quedan intactos, así que siguen cuadrando con lo que se entregó, y
la ganancia se calcula sobre lo realmente cobrado.

Son dos campos distintos a propósito: *Precio cobrado al cliente* es lo que
vale la venta, y *Monto recibido* lo que el cliente entregó —si es menos, la
venta queda a crédito con su saldo—. Al guardarla se **descuenta el inventario**
y se calcula la ganancia comparando lo cobrado con lo que costó la mercancía.
Cada renglón guarda una copia del nombre y los precios del momento, así que
cambiar un producto después no altera las ventas ya hechas.

Una venta no se edita: se **anula** —lo que devuelve el stock al inventario— y
se registra de nuevo. Así el histórico y el inventario nunca se descuadran.

En **Personal** se registra quién atiende la librería. Lo único obligatorio es
el nombre; el resto de los datos de contacto son opcionales. El pago se pacta
**por semana, por mes o por hora**, y de ese único monto salen los demás,
calculados en vivo mientras escribes:

```
por semana:  40 $/sem  ->  160 $/mes  ->  8 $/día  ->  2,00 $/hora (con 20 h)
por mes:    200 $/mes  ->   50 $/sem  -> 10 $/día  ->  2,50 $/hora (con 20 h)
por hora:     3 $/hora ->   45 $/sem  ->  9 $/día  ->  180 $/mes  (con 15 h)
```

El **pago semanal** es el que manda: es la base con la que se emite su nómina.
La ficha de cada trabajador muestra lo devengado, lo pagado y su saldo.

En **Estadísticas** se ve cómo le va al negocio:

- **Productos más vendidos**, por unidades, con lo que dejó cada uno y una
  barra que muestra qué parte del total representa.
- **Porcentaje de ganancia**, medido sobre lo vendido —no sobre el costo—:
  de cada 100 Bs que entran, cuántos quedan. Se calcula también por producto
  y por mes, así se ve qué es lo que de verdad deja margen.
- **Ventas mensuales** del año en un gráfico, con lo vendido y la ganancia
  lado a lado.

### Alquiler
El local es un gasto fijo, así que se lleva como los cobros: un recibo por mes,
con su fecha límite, lo abonado y el saldo. Si no se paga a tiempo el recibo
pasa a **vencido** para que se vea de un vistazo.

El botón **Emitir el del mes** crea el recibo del período con el monto habitual
—el de `BASE_RENT`— sin escribirlo cada vez, y no deja emitir dos veces el
mismo mes. Sobre un recibo se registran abonos parciales o el pago completo, y
un recibo se anula en vez de borrarse.

Puede pactarse en **dólares o en bolívares**: cada recibo guarda su moneda y se
muestra con su símbolo. Los totales del resumen se presentan separados por
moneda para no mezclarlos, y donde el panel necesita una sola cifra —el total a
pagar del mes— lo pactado en bolívares se pasa con la tasa del BCV.

El alquiler entra en el **total a pagar** del panel junto a la nómina.

### Panel general
**Deuda acumulada** consolidada (mensualidades y cobros + ventas de librería a
crédito + trabajos con precio que aún no se han facturado, sin contarlos dos
veces), con tarjetas propias para la **deuda de trabajos** y los **alumnos con
pago vencido**, y un desglose de en qué se compone. Se llama *acumulada* a
propósito: es de todos los meses, no del que esté elegido en la cabecera, y se
confundía con la deuda del mes.

Hay **dos deudas** y hacen falta las dos: **Por cobrar del mes** —a quién hay
que cobrarle ahora, con un enlace *Ver quién debe* que lleva a Alumnos ya
filtrado por los que deben algo— y **Deuda acumulada**, lo que se arrastra de
todos los meses.

Si el mes aún no tiene cobros emitidos, *Por cobrar* no muestra cero sino lo
que **se espera cobrar**: la suma de las mensualidades de los alumnos activos.
Un mes recién empezado no es un mes sin ingresos previstos.

Cuando el mes elegido **no tiene ningún cobro emitido**, un aviso lo dice antes
de las tarjetas. Si no, el panel entero sale en cero y se lee como "nadie debe
nada", que es lo contrario de lo que pasa: todavía no se ha facturado. El aviso
indica cuánto se esperaría facturar y lleva directo a generar las mensualidades.

La tarjeta de **nómina del mes** se lee de un vistazo: en rojo lo que aún se
debe —sumando profesores y personal de librería—, en verde el total cuando ya
está liquidada.

**Por pagar del mes** es lo que todavía falta desembolsar. La nómina y el
alquiler se suman entre sí —no se restan de lo cobrado— y lo que ya se liquidó
se descuenta, así que la cifra baja a medida que pagas y llega a cero en verde
cuando no queda nada.

```
por pagar = (nómina − lo ya pagado) + (alquiler − lo ya pagado)
```

**Ganancia del mes** es lo que entró menos lo que costó:

```
ganancia = cobrado a los alumnos + ganancia de librería − nómina − alquiler
```

De la librería entra su **ganancia**, no lo vendido: la mercancía se pagó antes
y contarla entera inflaría el resultado. Como la librería cobra en bolívares,
esa parte se pasa a la moneda base con la tasa del BCV. Los gastos van sobre lo
devengado del período, esté liquidado o no: lo que cuesta un mes no depende del
día en que se pague, y si solo se contara lo ya pagado, un mes sin liquidar
saldría igual que si el personal trabajara gratis.

**Cuentas del mes** es el cálculo completo, abierto en canal y a todo lo ancho:
en una columna lo que se generó, en la otra todo lo que salió, y debajo el
**neto** destacado.

```
generado = cobrado a los alumnos + ganancia de librería
gastos   = nómina + alquiler + pagos personales
neto     = generado − gastos
```

Va aparte de la tarjeta de ganancia y no la sustituye, porque responden a dos
preguntas distintas. La **ganancia** es la del negocio y no baja por los
retiros: un retiro es reparto de lo ganado, no un costo de operar. El **neto**
sí los descuenta, porque es el dinero que queda de verdad en la caja. Por eso
el neto coincide siempre con el *queda de la ganancia* de Pagos personales: es
la misma cifra llegando por el otro lado.

La suma se muestra entera a propósito. Con los sumandos delante, la cifra final
no hay que creérsela: se comprueba. La nota al pie dice con qué tasa del BCV
entró la parte de la librería, que es el único sumando que no está ya en la
moneda base.

Debajo van el gráfico anual de flujo —ese sí es caja pura: cuenta el dinero el
día en que entra o sale—, las ventas de la librería, el ranking de alumnos con
mayor saldo y la rentabilidad acumulada de trabajos.

---

## Estructura del proyecto

```
.
├── docker-compose.yml          Orquestación de los 4 servicios
├── .env                        Puertos, credenciales y secretos
├── backend/
│   └── src/
│       ├── config/             env, conexión Sequelize y definición Swagger
│       ├── models/             13 modelos + asociaciones (index.js)
│       ├── controllers/        Lógica; crudFactory.js genera el CRUD común
│       ├── routes/             Endpoints + anotaciones @openapi
│       ├── middlewares/        auth JWT, validación, manejo de errores
│       ├── utils/              ApiError, paginación, redondeo monetario
│       ├── services/           Tasa del BCV y emisión automática del mes
│       └── seed/               bootstrap, exportador y data.json
└── frontend/
    └── src/
        ├── api/client.js       Axios con inyección de token y manejo de 401
        ├── store/              Store Redux + createCrudSlice (fábrica)
        ├── components/         ResourcePage, ui.jsx, Layout, Icons
        ├── pages/              Una página por módulo
        └── utils/format.js     Moneda, fechas y etiquetas en español
```

Tres piezas evitan repetir código en todo el proyecto:

- **`backend/src/controllers/crudFactory.js`** genera listar / ver / crear /
  actualizar / eliminar con búsqueda, filtros, orden y paginación. Cada
  controlador solo aporta su modelo, sus campos buscables y sus relaciones.
- **`frontend/src/components/ResourcePage.jsx`** + **`store/createCrudSlice.js`**
  hacen lo mismo del lado del cliente: cada página declara sus columnas,
  filtros y campos de formulario, y obtiene tabla, buscador, paginación y modal
  de alta/edición.
- **`frontend/src/components/PayrollSection.jsx`** es la pantalla de nómina
  completa. La docente y la de librería cobran con la misma regla, así que
  comparten la vista y solo cambian a quién se le paga.

---

## API

Toda la API vive bajo `/api` y, salvo `POST /api/auth/login` y `/api/health`,
requiere el header `Authorization: Bearer <token>`.

En Swagger: pulsa **Authorize**, pega el token que devuelve el login y ya puedes
probar todos los endpoints desde el navegador.

| Recurso | Ruta base | Extras |
|---|---|---|
| Autenticación | `/api/auth` | `login`, `me`, `change-password`, `users` |
| Alumnos | `/api/students` | `/:id/profile`, `/:id/payment-status`, `/:id/charge`, `/:id/settle-debt`, `/debtors`, `/options` |
| Profesores | `/api/teachers` | `/:id/profile`, `/options` |
| Pagos | `/api/payments` | `/:id/settle`, `/:id/void`, `/:id/restore`, `/summary`, `/generate-monthly` |
| Nómina docente | `/api/teacher-payments` | `/:id/settle`, `/:id/void`, `/summary`, `/generate-payroll` |
| Personal de librería | `/api/library/staff` | `/:id/profile`, `/options` |
| Nómina de librería | `/api/library/payroll` | `/:id/settle`, `/:id/void`, `/summary`, `/generate-payroll` |
| Trabajos | `/api/works` | `/:id/settle`, `/:id/invoice`, `/summary` |
| Librería | `/api/library` | `/products`, `/products/:id/stock`, `/products/inventory`, `/sales`, `/sales/:id/settle`, `/sales/:id/void`, `/sales/summary` (estadísticas) |
| Alquiler | `/api/rent` | `/:id/settle`, `/:id/void`, `/summary`, `/generate` |
| Pagos personales | `/api/personal-payments` | `/summary` |
| Panel | `/api/dashboard` | `/overview`, `/cashflow` |
| Configuración | `/api/settings` | Moneda, precio base y `/exchange-rate` (tasa BCV) |

Los listados aceptan `page`, `limit`, `search`, `sort` (`campo:asc|desc`) y los
filtros propios de cada recurso, y responden con `{ success, data, meta }`.

---

## Modelo de datos

```
Student ──N StudentWork ──1 Teacher
   │            │
   │            └──> (opcional) Payment
   └──N Payment

Teacher ──N TeacherPayment

Employee ──N EmployeePayment

RentPayment     (gasto fijo, sin relaciones)
PersonalPayment (retiro de caja, sin relaciones)

Product ──N SaleItem ──1 Sale ──> (opcional) Student

```

Reglas de negocio implementadas en los modelos (`beforeValidate`), de modo que
se cumplen sin importar si el cambio entra por la interfaz o por la API:

- `Payment.status` se deriva de `paidAmount` frente a
  `amount - discount + surcharge`; `anulado` es el único estado manual.
- En cuanto un recibo recibe dinero se le sella la `paymentDate` si no la
  tiene, **también en los abonos parciales**: los ingresos del mes y el flujo
  del año se miden por esa fecha, y sin ella ese dinero no aparecía en ningún
  reporte. Vale igual para las dos nóminas y el alquiler.
- `TeacherPayment.amount` y `EmployeePayment.amount` se calculan como
  `weeks × weeklyRate`, o como `hours × rate` en los contratos por hora. Un
  monto escrito a mano manda.
- `Employee.weeklySalary` sale del tipo de pago pactado (semanal, mensual o por
  hora) y de ahí salen el sueldo del mes, el pago por día y la tarifa por hora.
  `Teacher` hace lo mismo a partir de alumnos × tarifa.
- `StudentWork.paymentStatus` se deriva de `paidAmount` frente a `price`
  (`sin_costo` cuando el precio es 0).
- `Sale.status` se deriva de `paidAmount` frente a `subtotal - discount`.
- `RentPayment.status` se deriva igual que el de un cobro, y pasa a `vencido`
  si llega la fecha límite sin pagarse.

---

## Configuración

Todo se ajusta en `.env` (hay una plantilla en `.env.example`):

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `academia` / `academia` / `academia123` | Credenciales de MySQL |
| `DB_PORT` | `3307` | Puerto de MySQL en el host |
| `BACKEND_PORT` | `4000` | Puerto del API |
| `FRONTEND_PORT` | `5173` | Puerto de la aplicación web |
| `ADMINER_PORT` | `8081` | Puerto del gestor de base de datos |
| `JWT_SECRET` | `cambia-este-secreto-en-produccion` | Firma de los tokens |
| `JWT_EXPIRES_IN` | `8h` | Duración de la sesión |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `Administrador` / `admin@academia.com` / `Admin123*` | Usuario que se crea al arrancar |
| `DB_SYNC_ALTER` | `false` | Ajusta columnas de tablas existentes al arrancar |
| `SEED_ON_START` | `true` | Carga `data.json` si la base arranca vacía |
| `CURRENCY` | `USD` | Moneda mostrada en la interfaz |
| `BASE_MONTHLY_FEE` | `70` | Precio base que propone el alta de alumnos |
| `BASE_ENROLLMENT_FEE` | `0` | Inscripción que propone el alta; 0 = no se cobra |
| `MONTHLY_DUE_DAY` | `5` | Día del mes en que vence la mensualidad |
| `AUTO_MONTHLY_CHARGES` | `true` | Emite sola la mensualidad del mes en curso a todos los alumnos activos |
| `AUTO_CHARGES_CHECK_HOURS` | `6` | Cada cuántas horas se comprueba si cambió el mes |
| `BASE_RENT` | `0` | Alquiler mensual que propone el recibo del mes |
| `RENT_CURRENCY` | `USD` | Moneda en que se pacta el alquiler |
| `RENT_DUE_DAY` | `5` | Día del mes en que vence el alquiler |
| `BASE_STUDENT_RATE` | `5` | Lo que cobra un profesor por alumno, a la semana |
| `WEEKS_PER_MONTH` | `4` | Semanas por mes para pasar el pago semanal a mensual |
| `DAYS_PER_WEEK` | `5` | Días de trabajo por semana para sacar el pago por día |
| `LIBRARY_CURRENCY` | `VES` | Moneda de la librería; el resto usa `CURRENCY` |
| `EXCHANGE_RATE_URL` | dolarapi | Espejo de respaldo si el BCV no responde |
| `EXCHANGE_RATE_TTL_MINUTES` | `360` | Cuánto se cachea la tasa antes de volver a pedirla |
| `ACADEMY_START_DATE` | `2026-09-15` | Día de apertura: su mes paga solo las semanas trabajadas |
| `TZ` | `America/Caracas` | Zona horaria de los contenedores |

Al arrancar, el backend crea con Sequelize las tablas que falten. Si modificas
un modelo y necesitas que se ajusten las columnas de una tabla ya existente,
levanta con `DB_SYNC_ALTER=true` esa vez y vuelve a dejarlo en `false`: MySQL
acumula índices duplicados en cada `alter` y termina topando el límite de 64
claves por tabla.

Ambos contenedores montan el código del host, así que los cambios se recargan en
caliente (nodemon en el backend, Vite en el frontend).

## Seguridad

### Los tres roles

| | `admin` | `usuario` | `demo` |
|---|---|---|---|
| Quién | El dueño | Quien atiende el día a día | Una visita |
| Alumnos, cobros, trabajos, librería | Todo | Ver, crear y editar | Ver, crear y editar |
| Borrar o anular cualquier cosa | Sí | **No** | **No** |
| Nómina de profesores y de librería | Sí | **No** | **No** |
| Alquiler del local | Sí | **No** | **No** |
| Pagos personales (retiros) | Sí | **No** | **No** |
| Ganancia y neto del mes | Sí | **No** | **No** |
| Lo que cobra cada profesor | Sí | **No** | **No** |
| Gestión de usuarios | Sí | **No** | **No** |
| Cambiar su propia contraseña | Sí | Sí | **No** |

Entre `admin` y `usuario` la diferencia no es "uno puede más que otro". Es que
hay información del negocio que no es asunto de quien atiende el mostrador: lo
que gana cada profesor, lo que cuesta el local, lo que el dueño retira para su
bolsillo y cuánto queda de ganancia.

#### Y la demo, que va aparte

`demo` ve y prueba exactamente lo mismo que `usuario`. Lo que lo separa no son
los permisos sino **dónde vive**: corre contra su propia base, con datos
inventados.

Esa es la única garantía de verdad. Una cuenta pública —cuyo correo y
contraseña se reparten en un enlace— contra la base real pondría los nombres de
30 menores, sus mensualidades y los retiros del dueño al alcance de cualquiera.
Un rol con menos permisos sobre los mismos datos sería una fuga esperando a que
alguien se equivoque en un filtro; una base distinta no tiene cómo fallar,
porque los alumnos reales no están ahí.

Por eso **el arranque se niega** a crear la cuenta de demostración si `DB_NAME`
no dice `demo`, y el sembrador de datos inventados se niega a correr contra
cualquier otra base. Es tosco a propósito: la alternativa es confiar en que
nadie se equivoque de variable el día del despliegue.

Lo único que `demo` no puede hacer y `usuario` sí es **cambiar su contraseña**.
La cuenta es compartida: el primer visitante que la cambiara dejaría fuera a
todos los demás, y a ti sin demo que enseñar.

Para montarla:

```bash
cp .env.production.example .env.demo
```

Rellena `DB_NAME` con algo que lleve `demo`, los `DEMO_*`, y siembra:

```bash
cd backend && DB_NAME=academia_demo npm run demo:sembrar
```

```bash
cd backend && npm run probar:demo
```

La última comprueba lo que importa: que la visita pueda mirar y probar, que no
pueda borrar ni anular ni cambiar la clave, que no vea cifras del negocio, y
que **ningún nombre de la academia real** asome por la demo.

Las cuentas se crean solas al arrancar, desde el entorno. La del usuario
**solo si defines `USUARIO_EMAIL` y `USUARIO_PASSWORD`**: una cuenta con clave
conocida es peor que no tener la cuenta. En producción el arranque exige
además que la clave tenga 12 caracteres y que no sea la misma del
administrador.

Si la cuenta ya existe, **no se le toca la contraseña**: alguien pudo haberla
cambiado desde la aplicación, y reponerla en cada arranque la devolvería al
valor del fichero de entorno.

#### Crearlas

Se crean solas al arrancar el backend. Para hacerlo a mano —por ejemplo contra
una base recién levantada— basta con la base en marcha:

```bash
docker compose up -d mongo
```

```bash
cd backend && MONGODB_URI=mongodb://localhost:27017 npm run bootstrap
```

Lee `ADMIN_*` y `USUARIO_*` del `.env`, dice qué hizo con cada cuenta y no pisa
nada de lo que ya exista.

#### Comprobar que funcionan

```bash
cd backend && npm run probar:cuentas
```

Levanta un MongoDB **en memoria** —no hace falta Docker y no toca ninguna base
real—, crea las dos cuentas y comprueba el cifrado de las contraseñas, que no
salgan de la base por descuido, que arrancar dos veces no duplique ni reponga
nada, la traducción de los roles antiguos y qué ve cada rol del panel.

La primera vez descarga el binario de MongoDB (unos 240 MB) y tarda; después es
cuestión de segundos.

#### Lo oculto está oculto en todas las puertas

Reservar la ruta de pagos personales no basta. El panel general publicaba el
total retirado, la ganancia del mes y los totales de nómina: la misma
información por otra puerta. Por eso la respuesta del panel **se recorta según
el rol antes de salir**, y lo mismo con los campos de sueldo al listar
profesores.

El recorte está escrito como **lista de lo permitido**, no de lo prohibido. Si
mañana el panel devuelve un dato nuevo, con una lista de prohibidos ese dato se
publicaría solo hasta que alguien se acordara de añadirlo; así, lo nuevo nace
oculto y hay que decidir expresamente que se muestra.

#### El rol sale de la base, no del token

El token lleva el rol dentro, pero no se usa para decidir: en cada petición se
lee el usuario. Cuesta una consulta más y a cambio degradar una cuenta surte
efecto al instante, en vez de esperar a que caduque su sesión. Un token
firmado que diga `role: admin` sobre una cuenta de usuario recibe un 403.

### Actividad: quién registró qué

Cada persona tiene su **pantalla de actividad**: lo que registró en el mes
elegido, cuánto cobró en dólares, cuánto en bolívares, y la lista de sus
movimientos con sus referencias.

- **Cada usuario ve la suya**, y solo la suya. Pedir la de otro devuelve 403.
- **El administrador ve la de cualquiera**, con un selector para cambiar de
  persona, y además un **cuadro comparativo** con todas a la vez. Ese cuadro es
  lo que de verdad sirve para controlar, porque deja comparar en lugar de
  obligar a abrir una ficha tras otra.

Lo reservado sigue reservado también aquí: en la pantalla de un usuario no
entran nómina, alquiler ni retiros personales. Hoy eso saldría en cero de todas
formas —no puede registrarlos—, pero está declarado para que si mañana se le
abre una de esas puertas, su actividad no empiece a publicar cifras del negocio
por este lado.

#### Quién lo registró se sella en un solo sitio

El autor se estampa en `crudFactory`, no en cada controlador: si cada sección
tuviera que acordarse, la primera que se olvidara dejaría un hueco en el
control sin que nadie lo notara. Y se toma **del token, nunca del cuerpo de la
petición**, para que nadie pueda registrar algo a nombre de otro.

#### Lo que no tiene nombre detrás no se reparte

El cuadro del administrador muestra aparte los registros **sin autor**: los
anteriores a que se guardara quién los hacía, y los que crea el propio sistema
—la mensualidad del mes se emite sola, sin usuario detrás—. No se atribuyen a
nadie. Repartirlos sería inventar, y esta pantalla existe justamente para no
inventar.

#### El frontend esconde, el API prohíbe

Las secciones de nómina, alquiler y pagos personales no aparecen en el menú de
quien no es administrador, y escribir la dirección a mano devuelve al panel.
Eso es comodidad, no seguridad: la seguridad la hace el API, que rechaza esas
rutas aunque la petición llegue desde fuera de la aplicación.

### El servidor se niega a arrancar mal configurado

Los valores del `.env.example` son **públicos**: están escritos en un fichero
que viaja en el repositorio. El peor de todos es `JWT_SECRET`, porque con él se
*firman* los tokens: quien lo conozca puede emitirse uno de administrador sin
pasar por el login.

Por eso, con `NODE_ENV=production`, el arranque revisa la configuración y
**corta el proceso** si encuentra alguno de estos casos:

| Comprobación | Por qué |
|---|---|
| `JWT_SECRET`, `ADMIN_PASSWORD` o `DB_PASSWORD` con el valor del repositorio | Son secretos conocidos; no son secretos |
| Esos mismos con menos de 32 / 12 / 12 caracteres | Demasiado cortos para resistir un ataque por diccionario |
| `CORS_ORIGIN=*` | Junto a `credentials` dejaría que cualquier web llamara al API con la sesión del usuario |
| `CORS_ORIGIN` con un dominio en `http://` | La sesión viajaría sin cifrar |
| `DB_SYNC_ALTER=true` | No se improvisa sobre el esquema de la base que tiene los datos reales |

Fuera de producción solo avisa, para no estorbar en desarrollo, pero imprime la
misma lista. Así nadie llega al despliegue con sorpresas.

Para generar un secreto de verdad:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Fuerza bruta

El login acepta **8 intentos fallidos cada 15 minutos por IP**. Solo cuentan
los fallidos: quien acierta no gasta cupo, así que entrar y salir varias veces
no deja a nadie fuera. El resto del API tiene un límite general de 600
peticiones cada 15 minutos, holgado a propósito —está para frenar un script, no
para estorbar a quien registra cobros a buen ritmo.

Los dos límites van por IP, y para que eso signifique algo detrás de un proxy
hace falta `TRUST_PROXY`. Sin él todas las peticiones parecen venir del proxy y
el límite se aplicaría a todos los usuarios como si fueran uno.

### Tokens

Se firman con **HS256 declarado explícitamente**. Si no se declara, el
algoritmo con el que se verifica lo elige el propio token que se está
comprobando, que es el ataque clásico de `alg: none`.

Cambiar la contraseña **tira todas las sesiones abiertas**: el usuario guarda
`passwordChangedAt` y cualquier token firmado antes de esa marca deja de
valer. Eso incluiría la sesión desde la que se está cambiando, así que
`change-password` devuelve un token nuevo: el que la cambia sigue dentro, los
demás se caen. Es lo que uno espera al cambiar una contraseña por sospecha.

Las contraseñas se guardan con **bcrypt a 12 rondas** y el mínimo es de 12
caracteres.

### Lo que no se cuenta por ahí

- Un **500 no explica por qué falló**. El mensaje de un error no controlado
  viene de la librería que lo lanzó, y eso puede ser la consulta SQL entera, el
  nombre de la tabla o la ruta del fichero. Al usuario no le sirve y a quien
  esté probando el API le sirve de mapa. El detalle queda en el log, que es su
  sitio. Los 4xx sí llevan su mensaje: son los que explican qué corregir.
- `/api/health` devuelve solo que está vivo y la hora. Antes decía el entorno y
  la moneda.
- **Swagger está apagado en producción** (`API_DOCS_ENABLED`). Documenta cada
  ruta, cada campo y cada rol: es un mapa regalado.
- El login responde lo mismo si el correo no existe que si la contraseña está
  mal, para no confirmar qué correos están registrados.

### Cabeceras

El API solo devuelve JSON, así que lleva la CSP más cerrada que existe
(`default-src 'none'`), HSTS de un año, `nosniff`, `no-referrer` y
`frame-ancestors 'none'`. No anuncia que está hecho con Express. La única
excepción es Swagger, que necesita sus propios estilos y scripts y se monta con
una CSP aparte, limitada a su propio origen.

### Datos personales

`backend/src/seed/data.json` guarda los datos **reales**: nombres de alumnos,
sus mensualidades y su historial de pagos. Son datos personales de menores.

Está en el `.gitignore` y en el `.dockerignore`, y tiene que seguir ahí:

- **No entra al repositorio**, aunque sea privado. Un repositorio cambia de
  visibilidad con un clic, y los forks y los clones ya no se recogen.
- **No entra a la imagen.** Una imagen se sube a un registry, se comparte, y se
  queda en capas que no se borran.

Para respaldar los datos, `npm run seed` genera el fichero en local; hay que
copiarlo a un sitio cifrado. La estructura de las tablas vive en `dataset.js`,
que sí está en el repositorio.

### Dependencias

Los dos proyectos tienen `package-lock.json` y los `Dockerfile` de producción
usan `npm ci`. Con `npm install` cada build podría resolver versiones
distintas: dos despliegues del mismo código no serían el mismo programa, y un
parche comprometido entraría solo.

Estado conocido de `npm audit --omit=dev`:

- **frontend**: sin avisos.
- **backend**: dos moderados, `sequelize` → `uuid`. La corrección exige
  Sequelize 7, que toca modelos, hooks, scopes y las consultas en crudo; queda
  pendiente como deuda conocida. No se alcanza desde la interfaz.

Los avisos *high* que aparecen sin `--omit=dev` vienen de `nodemon`
(`braces` → `chokidar`), que es sólo de desarrollo y nunca se despliega.

### Contenedores

Las imágenes de producción corren con el usuario `node`, sin privilegios: sin
eso el proceso sería root, y una ejecución remota de código empezaría siendo
root dentro del contenedor. Las etiquetas de imagen están fijadas
(`nginx:1.27-alpine`) en vez de seguir a `latest`.

## Despliegue: GitHub Pages + Vercel + MySQL propio

### El reparto

| Pieza | Dónde | Qué hace falta |
|---|---|---|
| Frontend | GitHub Pages | `VITE_BASE_PATH=/nombre-del-repo/` y `VITE_API_URL` apuntando a Vercel |
| API | Vercel | `backend/` como raíz del proyecto; las variables en el panel, nunca en el repositorio |
| Base de datos | Tu VPS | `DB_SSL=true` con su CA, y `DB_POOL_MAX=2` |

### Lo que hay que saber de este reparto

**MySQL queda expuesto a internet.** Las funciones de Vercel no tienen IP fija
salvo con Secure Compute, así que el puerto de MySQL no se puede cerrar a un
rango. Lo que queda es: TLS obligatorio (el arranque lo exige en cuanto
`DB_HOST` no es local), una contraseña larga, un usuario sin `GRANT ALL`, y
`fail2ban` vigilando el puerto. Si algún día pasas el backend al mismo VPS,
MySQL vuelve a `localhost` y este problema desaparece solo.

**El token viaja en `localStorage`**, porque Pages y Vercel son sitios
distintos y una cookie `httpOnly` entre ellos sería de terceros: Safari la
bloquea, Firefox la particiona y Chrome la está eliminando. La defensa es que
no haya forma de ejecutar un script ajeno, y de eso se encarga la CSP.

**GitHub Pages no deja poner cabeceras.** La CSP va en una etiqueta `meta`, que
cubre casi todo, pero el navegador ignora ahí `frame-ancestors` y `report-uri`.
En la práctica significa que no se puede impedir que la página se cargue dentro
de un iframe ajeno. Con un dominio propio detrás de cualquier CDN sí se puede.

**En serverless no hay proceso que viva entre peticiones**, así que la emisión
automática de mensualidades no corre sola: la llama el cron de Vercel una vez
al día contra `/api/cron/monthly-charges`, declarado en `backend/vercel.json`.
Es la misma función de siempre y sigue siendo idempotente.

### Preparar la base, una sola vez

El handler de Vercel (`backend/api/index.js`) **no** sincroniza el esquema ni
crea el administrador: eso abre la puerta a que un despliegue toque las tablas
de los datos reales. Se hace una vez, a mano, apuntando a la base del VPS:

```bash
cd backend && DB_HOST=tu-vps DB_SSL=true DB_SYNC_ALTER=true npm run bootstrap
```

Eso crea las tablas que falten —incluida la columna `password_changed_at` que
necesita la invalidación de sesiones— y garantiza el usuario administrador con
la contraseña de `ADMIN_PASSWORD`. Después se vuelve a `DB_SYNC_ALTER=false`.

### Variables en Vercel

Todas en el panel del proyecto, ninguna en el repositorio. Las que no pueden
faltar:

```
NODE_ENV=production
JWT_SECRET=<48 bytes aleatorios>
CORS_ORIGIN=https://tu-usuario.github.io
DB_HOST / DB_NAME / DB_USER / DB_PASSWORD
DB_SSL=true
DB_SSL_CA=<el PEM de la CA de tu MySQL>
DB_POOL_MAX=2
ADMIN_EMAIL / ADMIN_PASSWORD
CRON_SECRET=<otro valor aleatorio>
```

`CRON_SECRET` se llama así a propósito: Vercel reconoce ese nombre y manda el
valor en la cabecera `Authorization` de cada ejecución programada. Sin él la
ruta `/api/cron` **no queda abierta, queda cerrada**.

`CORS_ORIGIN` tiene que ser exactamente el origen de Pages. Sin la barra final
y sin la ruta del repositorio: `https://tu-usuario.github.io`.

### Pendiente

- Con el esquema ya estable, conviene gestionar los cambios futuros con
  migraciones en vez de `sync`.
- `sequelize` arrastra dos avisos moderados vía `uuid`; se cierran con
  Sequelize 7, que toca modelos, hooks y consultas en crudo.
