# Guía de Configuración de Dominio (.com.ar) para GitHub Pages

Esta guía detalla los pasos exactos para comprar un dominio en Argentina y conectarlo a la página web alojada en GitHub Pages.

## Paso 1: Comprar el dominio en NIC Argentina
1. Ingresá a **[nic.ar](https://nic.ar/)**.
2. Iniciá sesión con tu **CUIT/CUIL y Clave Fiscal Nivel 2**.
3. Buscá el nombre de dominio deseado (ej. `bariautos.com.ar`).
4. Agregalo al carrito, completá los datos del titular y realizá el pago. El dominio será tuyo por 1 año.

## Paso 2: Crear el "puente" en Cloudflare (Gratis)
Como NIC.ar no permite gestionar IPs directamente, necesitamos un gestor de DNS intermedio.
1. Creá una cuenta gratuita en **[cloudflare.com](https://cloudflare.com/)**.
2. Hacé clic en "Add a Site" (Agregar sitio) y escribí tu dominio (`bariautos.com.ar`). Seleccioná el plan "Free" (Gratis).
3. Cloudflare va a escanear tu dominio y luego te va a dar dos **Nombres de Servidor** (Nameservers). Son similares a:
   - `carl.ns.cloudflare.com`
   - `sue.ns.cloudflare.com`

## Paso 3: Delegar en NIC.ar
1. Volvé a **[nic.ar](https://nic.ar/)** y andá a tus dominios registrados.
2. Hacé clic en el botón de **Delegar** al lado de tu dominio.
3. Agregá una "Nueva Delegación" e ingresá los dos nombres de servidor que te dio Cloudflare en el paso anterior.
4. Guardá los cambios. *(Atención: Este proceso en NIC.ar puede tardar algunas horas en impactar en internet).*

## Paso 4: Conectar Cloudflare con GitHub Pages
1. Volvé al panel de control de tu dominio en **Cloudflare**.
2. En el menú izquierdo, andá a **DNS > Records** (Registros).
3. Tenés que crear **4 registros tipo "A"**.
   - Tipo: `A`
   - Nombre: `@` (o escribí tu dominio base)
   - Contenido/IP (Creá un registro distinto para cada una de estas 4 IPs):
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
4. Creá un último registro para que funcione el "www":
   - Tipo: `CNAME`
   - Nombre: `www`
   - Objetivo/Destino: `melisamillan.github.io` (reemplazar por tu usuario de GitHub).

## Paso 5: Avisarle a GitHub
1. Entrá a tu repositorio en GitHub y andá a la pestaña **Settings** (Configuración).
2. En el menú izquierdo hacé clic en **Pages**.
3. Scrolleá hasta **Custom domain** (Dominio personalizado).
4. Escribí tu dominio (ej. `bariautos.com.ar`) y hacé clic en **Save**.
5. Una vez que el chequeo de DNS finalice exitosamente, asegurate de tildar la casilla **"Enforce HTTPS"** para que la página sea segura (tenga el candadito verde).

¡Listo! Tu web ya está online bajo tu propio dominio profesional.
