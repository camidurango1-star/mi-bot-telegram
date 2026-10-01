require("dotenv").config();
const http = require("http");
const { Telegraf, Markup } = require("telegraf");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const TOKEN = process.env.BOT_TOKEN;

// ID DE TU TELEGRAM
const ADMIN_CHAT_ID = 7595474692;

if (!TOKEN) {
    console.error("❌ ERROR: No se encontró BOT_TOKEN en las variables de entorno.");
    process.exit(1);
}

const bot = new Telegraf(TOKEN);

// =====================================================
// MEMORIA TEMPORAL DE LOS USUARIOS
// =====================================================

const usuarios = new Map();

// Relaciona cada aviso enviado al administrador con el chat del cliente.
const avisosAdmin = new Map();

// =====================================================
// PRODUCTOS
// =====================================================

const productos = {
    vip: "⭐ Canal VIP — $20 USD",
    pack1: "📦 Pack 1 — 3 videos + 10 fotos — $30 USD",
    pack2: "📦 Pack 2 — 6 videos + 10 fotos — $45 USD",
    pack3: "📦 Pack 3 — 15 videos + 20 fotos — $90 USD",
    personalizado: "🎬 Video personalizado — $350 USD",
    llamada: "📞 Videollamada — $35 USD por minuto"
};

// =====================================================
// MANEJO DE ERRORES DE TELEGRAM / USUARIOS BLOQUEADOS
// =====================================================

function obtenerErrorTelegram(error) {
    const code = error?.response?.error_code ?? error?.error_code ?? null;
    const description =
        error?.response?.description ??
        error?.description ??
        error?.message ??
        "";

    return {
        code,
        description: String(description)
    };
}

function esUsuarioBloqueado(error) {
    const { code, description } = obtenerErrorTelegram(error);

    return (
        code === 403 &&
        /blocked by the user|user is deactivated|chat not found/i.test(description)
    );
}

function marcarUsuarioInactivo(ctx, motivo = "bloqueó el bot") {
    const id = ctx?.from?.id ?? ctx?.chat?.id;

    if (!id) return;

    const usuario = usuarios.get(id);

    if (usuario) {
        usuario.activo = false;
        usuario.bloqueado = true;
        usuario.motivoInactivo = motivo;
        usuario.inactivoEn = new Date().toISOString();
    }
}

async function responder(ctx, mensaje, extra = undefined) {
    try {
        const chatId = ctx?.chat?.id ?? ctx?.from?.id;

        if (!chatId) {
            console.warn("⚠️ No se encontró chat_id para responder.");
            return false;
        }

        const usuario = usuarios.get(chatId);

        // Evita llamadas innecesarias a usuarios que ya sabemos que bloquearon el bot.
        if (usuario?.activo === false) {
            return false;
        }

        try {
            await ctx.telegram.sendChatAction(chatId, "typing");
        } catch (error) {
            if (esUsuarioBloqueado(error)) {
                marcarUsuarioInactivo(ctx);
                console.log(`🔕 Usuario ${chatId} bloqueó el bot. Se omitió el typing.`);
                return false;
            }

            // Un fallo del indicador "typing" no debe impedir el envío del mensaje.
            console.warn("⚠️ No se pudo enviar sendChatAction:", error?.message || error);
        }

        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            return await ctx.reply(mensaje, extra);
        } catch (error) {
            if (esUsuarioBloqueado(error)) {
                marcarUsuarioInactivo(ctx);
                console.log(`🔕 Usuario ${chatId} bloqueó el bot. Se omitió el mensaje.`);
                return false;
            }

            throw error;
        }
    } catch (error) {
        console.error("❌ Error enviando mensaje:", error);
        return false;
    }
}

async function responderPremium(ctx, mensaje, extra = undefined) {
    const id = ctx?.from?.id;
    const usuario = id ? usuarios.get(id) : null;

    if (!usuario?.suscripcionActiva) {
        return responder(
            ctx,
            "🔒 Este contenido es premium.\n\n" +
            "Activa tu acceso para desbloquear las respuestas y beneficios premium. 💎",
            Markup.inlineKeyboard([
                [Markup.button.callback("💎 Ver acceso premium", "PREMIUM")]
            ])
        );
    }

    return responder(ctx, mensaje, extra);
}

// =====================================================
// FUNCIÓN PARA INFORMAR AL ADMIN
// =====================================================

async function avisarAdmin(mensaje) {
    try {
        return await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            mensaje
        );
    } catch (error) {
        const { code, description } =
            obtenerErrorTelegram(error);

        if (code === 403) {
            console.warn(
                "⚠️ El administrador bloqueó el bot o el chat no está disponible."
            );
            return false;
        }

        console.error(
            "❌ Error enviando información al administrador:",
            description
        );

        return false;
    }
}

// =====================================================
// AVISO DE INTERESADO + RESPUESTA DIRECTA AL CLIENTE
// =====================================================

async function avisarInteresado(ctx, producto) {
    const info = informacionUsuario(ctx);

    const mensaje =
        "🛒 NUEVO INTERESADO\n\n" +
        "👤 Nombre: " + info.nombre + "\n" +
        "🔹 Username: " + info.username + "\n" +
        "🆔 ID: " + info.id + "\n\n" +
        "🛍️ Producto seleccionado:\n" +
        producto + "\n\n" +
        "↩️ Responde a ESTE mensaje para hablar con el cliente.";

    const aviso = await avisarAdmin(mensaje);

    if (aviso?.message_id && info.id) {
        avisosAdmin.set(
            aviso.message_id,
            Number(info.id)
        );
    }

    return aviso;
}

async function responderAlClienteDesdeAdmin(ctx) {
    if (ctx.from?.id !== ADMIN_CHAT_ID) {
        return false;
    }

    const reply = ctx.message?.reply_to_message;

    if (!reply?.message_id) {
        return false;
    }

    const clienteId = avisosAdmin.get(reply.message_id);

    if (!clienteId) {
        return false;
    }

    const texto = ctx.message?.text?.trim();

    if (!texto) {
        return false;
    }

    try {
        await bot.telegram.sendMessage(
            clienteId,
            "💬 " + texto
        );

        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            "✅ Mensaje enviado al cliente " + clienteId
        ).catch(() => {});

        return true;
    } catch (error) {
        const { code, description } =
            obtenerErrorTelegram(error);

        if (
            code === 403 ||
            /blocked by the user|user is deactivated|chat not found/i.test(description)
        ) {
            const usuario = usuarios.get(clienteId);

            if (usuario) {
                usuario.activo = false;
                usuario.bloqueado = true;
                usuario.motivoInactivo = "bloqueó el bot";
            }

            await bot.telegram.sendMessage(
                ADMIN_CHAT_ID,
                "🔕 No se pudo enviar el mensaje.\n\n" +
                "El cliente " + clienteId +
                " bloqueó el bot o el chat ya no está disponible."
            ).catch(() => {});

            return true;
        }

        console.error(
            "❌ Error enviando respuesta del administrador al cliente:",
            error
        );

        return true;
    }
}

async function enviarFotoAdmin(fileId, caption) {
    try {
        return await bot.telegram.sendPhoto(ADMIN_CHAT_ID, fileId, { caption });
    } catch (error) {
        console.error("❌ Error enviando foto al administrador:", error?.message || error);
        return false;
    }
}

async function enviarDocumentoAdmin(fileId, caption) {
    try {
        return await bot.telegram.sendDocument(ADMIN_CHAT_ID, fileId, { caption });
    } catch (error) {
        console.error("❌ Error enviando documento al administrador:", error?.message || error);
        return false;
    }
}

// =====================================================
// OBTENER INFORMACIÓN DEL USUARIO
// =====================================================

function informacionUsuario(ctx) {
    const from = ctx.from || {};

    const nombre =
        [from.first_name, from.last_name]
            .filter(Boolean)
            .join(" ") || "Sin nombre";

    const username = from.username
        ? `@${from.username}`
        : "Sin username";

    return {
        id: from.id || "Sin ID",
        nombre,
        username
    };
}

// =====================================================
// AVISAR CUANDO UN USUARIO ENVÍA UN MENSAJE DE TEXTO
// =====================================================

async function avisarMensajeTexto(ctx) {
    try {
        if (!ctx.message?.text) return;

        const usuario = informacionUsuario(ctx);
        const texto = ctx.message.text;

        const mensaje =
            "📩 NUEVO MENSAJE\n\n" +
            "👤 Nombre: " + usuario.nombre + "\n" +
            "🔹 Username: " + usuario.username + "\n" +
            "🆔 ID: " + usuario.id + "\n\n" +
            "💬 Mensaje:\n" +
            texto;

        await avisarAdmin(mensaje);
    } catch (error) {
        console.error("❌ Error notificando mensaje:", error);
    }
}

// =====================================================
// CREAR USUARIO
// =====================================================

function crearUsuario(id) {
    const usuario = {
        paso: "como_estas",
        producto: null,
        metodoPago: null,
        atencionHumana: false,
        activo: true,
        bloqueado: false,
        suscripcionActiva: false,
        premiumDesde: null,
        creadoEn: new Date().toISOString()
    };

    usuarios.set(id, usuario);

    return usuario;
}
// =====================================================
// INICIAR CONVERSACIÓN
// =====================================================

async function iniciarConversacion(ctx) {
    crearUsuario(ctx.from.id);

    await responder(
        ctx,
        "Hola amor 💕 ¿Cómo estás?\n\n" +
        "✨ También tengo opciones premium disponibles.",
        Markup.inlineKeyboard([
            [Markup.button.callback("💎 Ver opciones premium", "PREMIUM")],
            [Markup.button.callback("🎥 Ver contenido", "CONTENIDO")]
        ])
    );
}

// =====================================================
// /START
// =====================================================

bot.start(async (ctx) => {
    await avisarMensajeTexto(ctx);
    await iniciarConversacion(ctx);
});

// =====================================================
// PREMIUM / MONETIZACIÓN
// =====================================================

const AFFILIATE_URL = process.env.AFFILIATE_URL || "";

function construirPatrocinio() {
    if (!AFFILIATE_URL) return "";

    return (
        "\n\n━━━━━━━━━━━━━━\n" +
        "💡 Recurso recomendado\n" +
        "👉 " + AFFILIATE_URL
    );
}

async function mostrarPremium(ctx) {
    const usuario = usuarios.get(ctx.from.id);

    if (usuario) {
        usuario.paso = "premium";
    }

    const patrocinio = construirPatrocinio();

    return responder(
        ctx,
        "💎 ACCESO PREMIUM\n\n" +
        "Desbloquea beneficios premium y atención prioritaria.\n\n" +
        "⭐ Canal VIP — $20 USD\n" +
        "🎬 Videos personalizados — $350 USD\n" +
        "📞 Videollamadas — $35 USD/minuto\n\n" +
        "Selecciona una opción para continuar." +
        patrocinio,
        Markup.inlineKeyboard([
            [Markup.button.callback("⭐ Comprar VIP — $20", "PRODUCTO_vip")],
            [Markup.button.callback("🎬 Personalizado — $350", "PRODUCTO_personalizado")],
            [Markup.button.callback("📞 Videollamada", "PRODUCTO_llamada")],
            [Markup.button.callback("📦 Ver todos los packs", "CONTENIDO")]
        ])
    );
}

async function activarPremiumDemo(ctx) {
    const usuario = usuarios.get(ctx.from.id);

    if (!usuario) return;

    // DEMO: en producción esta activación debe hacerse únicamente
    // después de confirmar el pago mediante tu pasarela o administrador.
    usuario.suscripcionActiva = true;
    usuario.premiumDesde = new Date().toISOString();

    await responder(
        ctx,
        "✅ Acceso premium DEMO activado.\n\n" +
        "⚠️ Esta activación es únicamente para pruebas. " +
        "En producción debes conectarla a la confirmación real del pago."
    );
}

// =====================================================
// MOSTRAR MENÚ
// =====================================================

async function mostrarMenu(ctx) {
    const usuario = usuarios.get(ctx.from.id);

    if (usuario) {
        usuario.paso = "menu";
        usuario.atencionHumana = false;
    }

    await responder(
        ctx,
        "Claro, amor 🔥💕\n\n" +
        "Mira todo lo que tengo disponible:\n\n" +

        "⭐ Canal VIP — $20 USD\n\n" +

        "📞 Videollamada — $35 USD por minuto\n" +
        "Mínimo 3 minutos\n\n" +

        "📦 Pack 1 — 3 videos + 10 fotos — $30 USD\n\n" +

        "📦 Pack 2 — 6 videos + 10 fotos — $45 USD\n\n" +

        "📦 Pack 3 — 15 videos + 20 fotos — $90 USD\n\n" +

        "🎬 Video personalizado — $350 USD\n\n" +

        "¿Cuál quieres, amor? 🥰" +
        construirPatrocinio(),

        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "⭐ VIP — $20",
                    "PRODUCTO_vip"
                )
            ],
            [
                Markup.button.callback(
                    "📦 Pack 1 — $30",
                    "PRODUCTO_pack1"
                )
            ],
            [
                Markup.button.callback(
                    "📦 Pack 2 — $45",
                    "PRODUCTO_pack2"
                )
            ],
            [
                Markup.button.callback(
                    "📦 Pack 3 — $90",
                    "PRODUCTO_pack3"
                )
            ],
            [
                Markup.button.callback(
                    "🎬 Personalizado — $350",
                    "PRODUCTO_personalizado"
                )
            ],
            [
                Markup.button.callback(
                    "📞 Videollamada",
                    "PRODUCTO_llamada"
                )
            ]
        ])
    );
}

// =====================================================
// PALABRAS PARA INICIAR CONVERSACIÓN
// =====================================================

bot.hears(
    /^(hola|holaa|holaaa|holaaaa|hola hermosa|hola amor|hola linda|hola preciosa|hola bella|hola divina|hola señorita|hola nayeli|hola hermosa nayeli|buenas|buenos días|buenas tardes|buenas noches|amor|mi amor|hola bebé|hola bebe|hola nena|hola reina|qué linda|qué hermosa|estás divina|cómo estás|como estas|cómo estás amor|como estas amor|hola cómo estás|hola como estas|amor cómo estás|qué haces|que haces|cómo amaneciste|cómo va tu día|cómo estás hoy|qué tal|qué tal estás|holi|holis|hey|hey hermosa|hey amor|ey|ey hermosa|ey amor|qué más|qué más hermosa|qué más amor|cómo vas|cómo te va)$/i,
    async (ctx) => {
        const usuario = usuarios.get(ctx.from.id);

        if (!usuario) {
            return iniciarConversacion(ctx);
        }

        if (usuario.atencionHumana) {
            return;
        }

        return responder(
            ctx,
            "Hola otra vez, amor 🥰💕 ¿Cómo estás?"
        );
    }
);

// =====================================================
// MENSAJES DE TEXTO
// =====================================================

// RESPUESTAS DEL ADMINISTRADOR A LOS CLIENTES
// =====================================================

bot.on("text", async (ctx, next) => {
    if (ctx.from?.id !== ADMIN_CHAT_ID) {
        return next();
    }

    if (ctx.message?.reply_to_message) {
        const enviado =
            await responderAlClienteDesdeAdmin(ctx);

        if (enviado) {
            return;
        }
    }

    return next();
});

// =====================================================

bot.on("text", async (ctx) => {
    // Los mensajes del administrador se gestionan arriba.
    if (ctx.from?.id === ADMIN_CHAT_ID) {
        return;
    }

    const id = ctx.from.id;

    const mensaje = ctx.message.text
        .trim()
        .toLowerCase();

    let usuario = usuarios.get(id);

    // =================================================
    // USUARIO NUEVO
    // =================================================

    if (!usuario) {
        usuario = crearUsuario(id);

        return responder(
            ctx,
            "Hola amor 💕 ¿Cómo estás?"
        );
    }

    // =================================================
    // ATENCIÓN HUMANA
    // =================================================

    if (usuario.atencionHumana) {
        return;
    }

    // =================================================
    // DETECTAR CONTENIDO / PRODUCTOS
    // =================================================

    if (
        mensaje.includes("contenido") ||
        mensaje.includes("canal") ||
        mensaje.includes("pack") ||
        mensaje.includes("videollamada") ||
        mensaje.includes("video llamada") ||
        mensaje.includes("personalizado") ||
        mensaje.includes("cuánto") ||
        mensaje.includes("cuanto") ||
        mensaje.includes("precio") ||
        mensaje.includes("precios") ||
        mensaje.includes("menu") ||
        mensaje.includes("menú")
    ) {
        return mostrarMenu(ctx);
    }

    // =================================================
    // CONVERSACIÓN: ¿CÓMO ESTÁS?
    // =================================================

    if (usuario.paso === "como_estas") {
        usuario.paso = "origen";

        return responder(
            ctx,
            "Ah, me alegro amor 🥰\n\n" +
            "Yo estoy bien, gracias a Dios ❤️\n\n" +
            "¿Y tú de dónde eres?"
        );
    }

    // =================================================
    // CONVERSACIÓN: PAÍS / ORIGEN
    // =================================================

    if (usuario.paso === "origen") {
        usuario.paso = "edad";

        return responder(
            ctx,
            "Ah, qué lindo país 🥰\n\n" +
            "Yo soy de Colombia, amor 🇨🇴\n\n" +
            "¿Y tú de qué parte eres?"
        );
    }

    // =================================================
    // CONVERSACIÓN: CIUDAD
    // =================================================

    if (usuario.paso === "edad") {
        usuario.paso = "ocupacion";

        return responder(
            ctx,
            "Ahh, qué lindo 🥰\n\n" +
            "Yo soy de Pereira ❤️\n\n" +
            "¿Y qué edad tienes, amor?"
        );
    }

    // =================================================
    // CONVERSACIÓN: EDAD
    // =================================================

    if (usuario.paso === "ocupacion") {
        usuario.paso = "pregunta";

        return responder(
            ctx,
            "Ah, vale amor 🥰\n\n" +
            "Yo tengo 20 años ❤️\n\n" +
            "¿Y a qué te dedicas?"
        );
    }

    // =================================================
    // CONVERSACIÓN: OCUPACIÓN
    // =================================================

    if (usuario.paso === "pregunta") {
        usuario.paso = "eleccion";

        return responder(
            ctx,
            "Ohh, qué bien amor 🥰💕\n\n" +
            "Vale amor, ¿te quieres divertir conmigo? 😏💕\n\n" +
            "¿Te puedo preguntar algo?\n\n" +
            "¿Quieres mi contenido exclusivo o quieres que sea tu novia virtual? ❤️",

            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "🎥 Contenido exclusivo",
                        "CONTENIDO"
                    )
                ],
                [
                    Markup.button.callback(
                        "💗 Novia virtual",
                        "NOVIA"
                    )
                ]
            ])
        );
    }

    // =================================================
    // MENÚ
    // =================================================

    if (usuario.paso === "menu") {
        return mostrarMenu(ctx);
    }

    // =================================================
    // MÉTODO DE PAGO
    // =================================================

    if (usuario.paso === "metodo_pago") {
        return responder(
            ctx,
            "Selecciona uno de los métodos de pago disponibles usando los botones de arriba, amor ❤️"
        );
    }
        // =================================================
    // ESPERANDO COMPROBANTE
    // =================================================

    if (usuario.paso === "esperando_comprobante") {
        return responder(
            ctx,
            "Cuando realices el pago, envíame el comprobante por aquí ❤️"
        );
    }

    // =================================================
    // CHAT NOVIA VIRTUAL
    // =================================================

    if (usuario.paso === "novia_chat") {
        return responderPremium(
            ctx,
            "Mmm, cuéntame amor 🥰💕\n\n" +
            "Quiero conocerte un poquito más."
        );
    }

    // =================================================
    // RESPUESTA GENERAL
    // =================================================

    return responder(
        ctx,
        "Mmm, cuéntame amor 🥰💕"
    );
});

// =====================================================
// NOVIA VIRTUAL
// =====================================================

bot.action("NOVIA", async (ctx) => {
    try {
        await ctx.answerCbQuery();

        let usuario = usuarios.get(ctx.from.id);

        if (!usuario) {
            usuario = crearUsuario(ctx.from.id);
        }

        usuario.paso = "novia_chat";
        usuario.atencionHumana = false;

        await responderPremium(
            ctx,
            "Ok, dale amor 🥰💕\n\n" +
            "Ya te agrego a mis contactos ❤️\n\n" +
            "Ahora podemos hablar más personalmente."
        );
    } catch (error) {
        console.error("❌ Error en NOVIA:", error);
    }
});

// =====================================================
// BOTONES PREMIUM
// =====================================================

bot.action("PREMIUM", async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await mostrarPremium(ctx);
    } catch (error) {
        console.error("❌ Error en PREMIUM:", error);
    }
});

bot.action("ACTIVAR_PREMIUM_DEMO", async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await activarPremiumDemo(ctx);
    } catch (error) {
        console.error("❌ Error activando premium demo:", error);
    }
});

// =====================================================
// BOTÓN CONTENIDO
// =====================================================

bot.action("CONTENIDO", async (ctx) => {
    try {
        await ctx.answerCbQuery();

        let usuario = usuarios.get(ctx.from.id);

        if (!usuario) {
            usuario = crearUsuario(ctx.from.id);
        }

        await mostrarMenu(ctx);
    } catch (error) {
        console.error("❌ Error en CONTENIDO:", error);
    }
});

// =====================================================
// PRODUCTO SELECCIONADO
// =====================================================

bot.action(/^PRODUCTO_(.+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();

        const codigo = ctx.match[1];
        const producto = productos[codigo];

        if (!producto) {
            return responder(
                ctx,
                "Uy amor, no encontré ese producto 🥺"
            );
        }

        let usuario = usuarios.get(ctx.from.id);

        if (!usuario) {
            usuario = crearUsuario(ctx.from.id);
        }

        usuario.paso = "metodo_pago";
        usuario.producto = codigo;
        usuario.atencionHumana = false;

        await avisarInteresado(
            ctx,
            producto
        );

        await responder(
            ctx,
            "Perfecto, amor 🥰💕\n\n" +
            "Elegiste:\n\n" +
            producto +
            "\n\n" +
            "¿Por qué medio de pago quieres cancelar? 💳❤️\n\n" +
            "💬 Si necesitas ayuda, te atenderemos por este mismo chat.",

            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "💳 PayPal",
                        "PAGO_PAYPAL"
                    )
                ],
                [
                    Markup.button.callback(
                        "🏦 Bancolombia",
                        "PAGO_BANCOLOMBIA"
                    )
                ],
                [
                    Markup.button.callback(
                        "📱 Nequi",
                        "PAGO_NEQUI"
                    )
                ],
                [
                    Markup.button.callback(
                        "🟡 Binance",
                        "PAGO_BINANCE"
                    )
                ],
                [
                    Markup.button.callback(
                        "💰 USDT",
                        "PAGO_USDT"
                    )
                ],
                [
                    Markup.button.callback(
                        "🌎 Western Union",
                        "PAGO_WESTERN"
                    )
                ],
                [
                    Markup.button.callback(
                        "🏦 Cuenta ACH",
                        "PAGO_ACH"
                    )
                ]
            ])
        );
    } catch (error) {
        console.error("❌ Error seleccionando producto:", error);
    }
});

// =====================================================
// FUNCIÓN PARA MOSTRAR DATOS DE PAGO
// =====================================================

async function mostrarPago(ctx, texto) {
    try {
        let usuario = usuarios.get(ctx.from.id);

        if (!usuario) {
            usuario = crearUsuario(ctx.from.id);
        }

        usuario.paso = "esperando_comprobante";
        usuario.metodoPago = texto;
        usuario.atencionHumana = false;

        await avisarAdmin(
            "💳 MÉTODO DE PAGO SELECCIONADO\n\n" +
            "👤 Nombre: " +
            informacionUsuario(ctx).nombre +
            "\n🔹 Username: " +
            informacionUsuario(ctx).username +
            "\n🆔 ID: " +
            informacionUsuario(ctx).id +
            "\n\n" +
            texto
        );

        await responder(
            ctx,
            texto
        );

        await responder(
            ctx,
            "Cuando realices el pago, amor ❤️\n\n" +
            "Envíame el comprobante para verificarlo y enviarte tu contenido exclusivo. 🥰",

            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Ya hice el pago",
                        "YA_PAGUE"
                    )
                ]
            ])
        );
    } catch (error) {
        console.error("❌ Error mostrando pago:", error);
    }
}

// =====================================================
// PAYPAL
// =====================================================

bot.action("PAGO_PAYPAL", async (ctx) => {
    await ctx.answerCbQuery();

    await mostrarPago(
        ctx,
        "💳 PAYPAL\n\n" +
        "Haz tu pago aquí:\n\n" +
        "👉 https://www.paypal.me/camidurango1\n\n" +
        "Después de realizar el pago, pulsa «Ya hice el pago» y envía tu comprobante."
    );
});

// =====================================================
// BANCOLOMBIA
// =====================================================

bot.action("PAGO_BANCOLOMBIA", async (ctx) => {
    await ctx.answerCbQuery();

    await mostrarPago(
        ctx,
        "🏦 BANCOLOMBIA\n\n" +
        "Banco: Bancolombia\n" +
        "Tipo de cuenta: AQUÍ_VA_EL_TIPO\n" +
        "Número: AQUÍ_VA_EL_NÚMERO\n" +
        "Titular: AQUÍ_VA_EL_TITULAR"
    );
});

// =====================================================
// NEQUI
// =====================================================

bot.action("PAGO_NEQUI", async (ctx) => {
    await ctx.answerCbQuery();

    await mostrarPago(
        ctx,
        "📱 NEQUI\n\n" +
        "🔑 Llave Nequi: @NEQUIJUA78313\n" +
        "👤 Titular: Ju Co\n\n" +
        "Después de realizar el pago, pulsa «Ya hice el pago» y envía tu comprobante."
    );
});

// =====================================================
// BINANCE
// =====================================================

bot.action("PAGO_BINANCE", async (ctx) => {
    await ctx.answerCbQuery();

    await mostrarPago(
        ctx,
        "🟡 BINANCE\n\n" +
        "Usuario / ID: AQUÍ_VA_TU_BINANCE"
    );
});

// =====================================================
// USDT
// =====================================================

bot.action("PAGO_USDT", async (ctx) => {
    await ctx.answerCbQuery();

    await mostrarPago(
        ctx,
        "💰 USDT\n\n" +
        "Red: AQUÍ_VA_LA_RED\n" +
        "Dirección: AQUÍ_VA_LA_DIRECCIÓN\n\n" +
        "⚠️ Verifica muy bien la red antes de enviar."
    );
});

// =====================================================
// WESTERN UNION
// =====================================================

bot.action("PAGO_WESTERN", async (ctx) => {
    await ctx.answerCbQuery();

    await mostrarPago(
        ctx,
        "🌎 WESTERN UNION\n\n" +
        "Nombre: AQUÍ_VA_EL_NOMBRE\n" +
        "País: AQUÍ_VA_EL_PAÍS"
    );
});

// =====================================================
// CUENTA ACH
// =====================================================

bot.action("PAGO_ACH", async (ctx) => {
    await ctx.answerCbQuery();

    await mostrarPago(
        ctx,
        "🏦 CUENTA ACH\n\n" +
        "Banco: AQUÍ_VA_EL_BANCO\n" +
        "Titular: AQUÍ_VA_EL_TITULAR\n" +
        "Número de cuenta: AQUÍ_VA_EL_NÚMERO\n" +
        "Routing / ACH: AQUÍ_VA_EL_ROUTING"
    );
});
// =====================================================
// YA HIZO EL PAGO
// =====================================================

bot.action("YA_PAGUE", async (ctx) => {
    try {
        await ctx.answerCbQuery();

        let usuario = usuarios.get(ctx.from.id);

        if (!usuario) {
            usuario = crearUsuario(ctx.from.id);
        }

        usuario.paso = "comprobante";
        usuario.atencionHumana = true;

        const info = informacionUsuario(ctx);

        await avisarAdmin(
            "🚨 EL USUARIO DICE QUE YA PAGÓ\n\n" +
            "👤 Nombre: " + info.nombre + "\n" +
            "🔹 Username: " + info.username + "\n" +
            "🆔 ID: " + info.id + "\n\n" +
            "📎 Está a punto de enviar el comprobante."
        );

        await responder(
            ctx,
            "Perfecto, amor ❤️\n\n" +
            "Envíame por aquí el comprobante de pago para verificarlo. 🥰"
        );

    } catch (error) {
        console.error("❌ Error en YA_PAGUE:", error);
    }
});

    
// =====================================================
// ACTIVACIÓN PREMIUM PARA PRUEBAS / ADMIN
// =====================================================

bot.command("activarvip", async (ctx) => {
    if (ctx.from.id !== ADMIN_CHAT_ID) {
        return responder(ctx, "No tienes permiso para usar este comando.");
    }

    const partes = ctx.message.text.trim().split(/\s+/);
    const userId = Number(partes[1]);

    if (!Number.isSafeInteger(userId)) {
        return responder(
            ctx,
            "Uso: /activarvip ID_DEL_USUARIO"
        );
    }

    const usuario = usuarios.get(userId);

    if (!usuario) {
        return responder(
            ctx,
            "Ese usuario no está en la memoria temporal del bot."
        );
    }

    usuario.suscripcionActiva = true;
    usuario.premiumDesde = new Date().toISOString();

    await responder(
        ctx,
        `✅ Premium activado para ${userId}.`
    );
});

// =====================================================
// RECIBIR COMPROBANTES / FOTOS / DOCUMENTOS
// =====================================================

bot.on(["photo", "document"], async (ctx) => {
    try {
        const usuario = usuarios.get(ctx.from.id);

        if (!usuario || usuario.paso !== "comprobante") {
            return;
        }

        const info = informacionUsuario(ctx);

        console.log(
            `📎 Comprobante recibido del usuario ${ctx.from.id}`
        );

        // -------------------------------------------------
        // ENVIAR INFORMACIÓN DEL USUARIO AL ADMIN
        // -------------------------------------------------

        await avisarAdmin(
            "📎 COMPROBANTE RECIBIDO\n\n" +
            "👤 Nombre: " + info.nombre + "\n" +
            "🔹 Username: " + info.username + "\n" +
            "🆔 ID: " + info.id + "\n\n" +
            "📥 El comprobante fue enviado a continuación."
        );

        // -------------------------------------------------
        // SI ES FOTO
        // -------------------------------------------------

        if (ctx.message.photo) {
            const fotos = ctx.message.photo;
            const foto = fotos[fotos.length - 1];

            await enviarFotoAdmin(
                foto.file_id,
                "📸 Comprobante de " +
                info.nombre +
                " (" +
                info.id +
                ")"
            );
        }

        // -------------------------------------------------
        // SI ES DOCUMENTO
        // -------------------------------------------------

        if (ctx.message.document) {
            await enviarDocumentoAdmin(
                ctx.message.document.file_id,
                "📄 Comprobante de " +
                info.nombre +
                " (" +
                info.id +
                ")"
            );
        }

        await responder(
    ctx,
    "✅ Comprobante recibido, amor ❤️\n\n" +
    "Ya lo envié para verificación.\n\n" +
    "💬 Si necesitas hablar directamente conmigo sobre tu pago, puedes escribirme aquí:",
    Markup.inlineKeyboard([
        [
            Markup.button.url(
                "💬 Hablar conmigo",
                "https://t.me/nayelidurango"
            )
        ]
    ])
);
    } catch (error) {
        console.error("❌ Error recibiendo comprobante:", error);
    }
});

// =====================================================
// ERRORES DEL BOT
// =====================================================

bot.catch((error, ctx) => {
    if (esUsuarioBloqueado(error)) {
        marcarUsuarioInactivo(ctx);
        console.log(
            `🔕 Usuario ${ctx?.from?.id ?? "desconocido"} bloqueó el bot. Error 403 controlado.`
        );
        return;
    }

    console.error("❌ ERROR DEL BOT:", error);
    console.error("Usuario:", ctx?.from?.id);
});
// =====================================================
// SERVIDOR WEB PARA RENDER
// =====================================================

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("Bot de Telegram funcionando");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        `🌐 Servidor web escuchando en el puerto ${PORT}`
    );
});

// =====================================================
// INICIAR BOT
// =====================================================

console.log("🚀 Iniciando bot...");

async function iniciarBot() {
    try {
        await bot.telegram.deleteWebhook({
            drop_pending_updates: false
        });

        console.log("🧹 Webhook eliminado correctamente.");

        await bot.launch();

        console.log(
            "🤖 Bot de Nayeli está funcionando correctamente."
        );

        console.log(
            "📩 Las notificaciones de usuarios se enviarán al administrador."
        );
    } catch (error) {
        const { code, description } =
            obtenerErrorTelegram(error);

        console.error(
            `❌ Error al iniciar el bot${code ? ` (${code})` : ""}: ${description}`
        );

        // 409 significa que otra instancia está usando getUpdates.
        if (code === 409) {
            console.error(
                "⚠️ Telegram detectó otra instancia de este bot usando getUpdates."
            );
        }

        process.exitCode = 1;
    }
}

iniciarBot();

// =====================================================
// CIERRE CORRECTO
// =====================================================

process.once("SIGINT", () => {
    console.log("🛑 Cerrando bot...");
    bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
    console.log("🛑 Cerrando bot...");
    bot.stop("SIGTERM");
});