require("dotenv").config();

const http = require("http");
const { Telegraf, Markup } = require("telegraf");

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = 7595474692;

if (!TOKEN) {
    console.error("❌ ERROR: No se encontró BOT_TOKEN.");
    process.exit(1);
}

const bot = new Telegraf(TOKEN);

// =====================================================
// CONFIGURACIÓN
// =====================================================

const CONTACTO = "https://t.me/nayelidurango";
const PAYPAL = "https://www.paypal.me/camidurango1";

const usuarios = new Map();
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
// USUARIOS
// =====================================================

function crearUsuario(id) {
    const usuario = {
        paso: "como_estas",
        producto: null,
        metodoPago: null,
        comprobanteRecibido: false,
        pagoVerificado: false,
        activo: true,
        creadoEn: new Date().toISOString()
    };

    usuarios.set(id, usuario);
    return usuario;
}

function obtenerUsuario(ctx) {
    let usuario = usuarios.get(ctx.from.id);

    if (!usuario) {
        usuario = crearUsuario(ctx.from.id);
    }

    return usuario;
}

function informacionUsuario(ctx) {
    const from = ctx.from || {};

    return {
        id: from.id,
        nombre:
            [from.first_name, from.last_name]
                .filter(Boolean)
                .join(" ") || "Sin nombre",
        username: from.username
            ? `@${from.username}`
            : "Sin username"
    };
}

// =====================================================
// RESPONDER
// =====================================================

async function responder(ctx, texto, extra = {}) {
    try {
        return await ctx.reply(texto, extra);
    } catch (error) {
        console.error("❌ Error enviando mensaje:", error.message);
        return null;
    }
}

// =====================================================
// CONTACTO
// =====================================================

function botonContacto() {
    return [
        Markup.button.url(
            "💬 Hablar conmigo",
            CONTACTO
        )
    ];
}

// =====================================================
// ADMIN
// =====================================================

async function avisarAdmin(texto, teclado = null) {
    try {
        const opciones = teclado
            ? Markup.inlineKeyboard(teclado)
            : undefined;

        return await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            texto,
            opciones
        );
    } catch (error) {
        console.error(
            "❌ Error avisando al administrador:",
            error.message
        );

        return null;
    }
}

function botonEscribirUsuario(ctx) {
    const username = ctx.from?.username;

    const url = username
        ? `https://t.me/${username}`
        : `tg://user?id=${ctx.from.id}`;

    return Markup.button.url(
        "💬 Escribir al usuario",
        url
    );
}

async function avisarInteresado(ctx, producto) {
    const info = informacionUsuario(ctx);

    const texto =
        "🛒 NUEVO INTERESADO\n\n" +
        `👤 Nombre: ${info.nombre}\n` +
        `🔹 Username: ${info.username}\n` +
        `🆔 ID: ${info.id}\n\n` +
        "🛍️ Producto:\n" +
        `${producto}\n\n` +
        "💬 Puedes escribirle directamente al usuario.";

    const aviso = await avisarAdmin(texto, [
        [botonEscribirUsuario(ctx)]
    ]);

    if (aviso?.message_id) {
        avisosAdmin.set(
            aviso.message_id,
            ctx.from.id
        );
    }
}

// =====================================================
// /START
// =====================================================

bot.start(async (ctx) => {
    crearUsuario(ctx.from.id);

    const info = informacionUsuario(ctx);

    await avisarAdmin(
        "👤 NUEVO USUARIO\n\n" +
        `Nombre: ${info.nombre}\n` +
        `Username: ${info.username}\n` +
        `ID: ${info.id}`,
        [
            [botonEscribirUsuario(ctx)]
        ]
    );

    await responder(
        ctx,
        "Hola amor 💕 ¿Cómo estás?"
    );
});

// =====================================================
// PREMIUM
// =====================================================

async function mostrarPremium(ctx) {
    const usuario = obtenerUsuario(ctx);
    usuario.paso = "menu";

    await responder(
        ctx,
        "💎 ACCESO PREMIUM\n\n" +
        "Desbloquea beneficios premium y atención prioritaria.\n\n" +
        "⭐ VIP — $20 USD\n" +
        "🎬 Video personalizado — $350 USD\n" +
        "📞 Videollamada — $35 USD/minuto\n\n" +
        "Selecciona una opción:",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "⭐ VIP — $20",
                    "PRODUCTO_vip"
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
            ],
            [
                Markup.button.callback(
                    "📦 Ver todos los packs",
                    "CONTENIDO"
                )
            ],
            botonContacto()
        ])
    );
}

bot.action("PREMIUM", async (ctx) => {
    await ctx.answerCbQuery();
    await mostrarPremium(ctx);
});

// =====================================================
// MENÚ DE PRODUCTOS
// =====================================================

async function mostrarMenu(ctx) {
    const usuario = obtenerUsuario(ctx);
    usuario.paso = "menu";

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

        "¿Cuál quieres, amor? 🥰",

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
            ],
            botonContacto()
        ])
    );
}

bot.action("CONTENIDO", async (ctx) => {
    await ctx.answerCbQuery();
    await mostrarMenu(ctx);
});

// =====================================================
// NOVIA VIRTUAL
// =====================================================

bot.action("NOVIA", async (ctx) => {
    await ctx.answerCbQuery();

    const usuario = obtenerUsuario(ctx);
    usuario.paso = "novia";

    await responder(
        ctx,
        "💗 Claro, amor.\n\n" +
        "Si quieres hablar conmigo personalmente, puedes escribirme directamente aquí ❤️",
        Markup.inlineKeyboard([
            botonContacto()
        ])
    );
});

// =====================================================
// PRODUCTO SELECCIONADO
// =====================================================

bot.action(/^PRODUCTO_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const codigo = ctx.match[1];
    const producto = productos[codigo];

    if (!producto) {
        return responder(
            ctx,
            "No encontré ese producto ❤️"
        );
    }

    const usuario = obtenerUsuario(ctx);

    usuario.producto = codigo;
    usuario.paso = "metodo_pago";

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
        "Selecciona tu forma de pago:",

        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "💙 PayPal",
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
                    "💚 Nequi",
                    "PAGO_NEQUI"
                )
            ],
            [
                Markup.button.url(
                    "🟡 Binance • USDT • Western Union • Cuenta ACH",
                    CONTACTO
                )
            ],
            botonContacto()
        ])
    );
});

// =====================================================
// PAYPAL
// =====================================================

bot.action("PAGO_PAYPAL", async (ctx) => {
    await ctx.answerCbQuery();

    const usuario = obtenerUsuario(ctx);
    usuario.metodoPago = "PayPal";
    usuario.paso = "comprobante";

    await responder(
        ctx,
        "💙 PAGO POR PAYPAL\n\n" +
        "Puedes realizar el pago mediante PayPal:\n\n" +
        PAYPAL +
        "\n\n" +
        "Cuando realices el pago, amor ❤️, envíame el comprobante para verificarlo.",

        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "✅ Ya hice el pago",
                    "YA_PAGUE"
                )
            ],
            botonContacto()
        ])
    );

    await avisarAdmin(
        "💳 MÉTODO DE PAGO\n\n" +
        `👤 ${informacionUsuario(ctx).nombre}\n` +
        `🆔 ${ctx.from.id}\n\n` +
        "💙 PayPal",
        [
            [botonEscribirUsuario(ctx)]
        ]
    );
});

// =====================================================
// BANCOLOMBIA
// =====================================================

bot.action("PAGO_BANCOLOMBIA", async (ctx) => {
    await ctx.answerCbQuery();

    const usuario = obtenerUsuario(ctx);
    usuario.metodoPago = "Bancolombia";
    usuario.paso = "comprobante";

    await responder(
        ctx,
        "🏦 BANCOLOMBIA\n\n" +
        "Número de cuenta:\n" +
        "62100000924\n\n" +
        "Tipo: Cuenta de ahorros\n\n" +
        "Titular:\n" +
        "Ju** Co**\n\n" +
        "Cuando realices el pago, amor ❤️, envíame el comprobante para verificarlo.",

        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "✅ Ya hice el pago",
                    "YA_PAGUE"
                )
            ],
            botonContacto()
        ])
    );

    await avisarAdmin(
        "🏦 MÉTODO DE PAGO\n\n" +
        `👤 ${informacionUsuario(ctx).nombre}\n` +
        `🆔 ${ctx.from.id}\n\n` +
        "🏦 Bancolombia",
        [
            [botonEscribirUsuario(ctx)]
        ]
    );
});

// =====================================================
// NEQUI
// =====================================================

bot.action("PAGO_NEQUI", async (ctx) => {
    await ctx.answerCbQuery();

    const usuario = obtenerUsuario(ctx);
    usuario.metodoPago = "Nequi";
    usuario.paso = "comprobante";

    await responder(
        ctx,
        "💚 PAGO POR NEQUI\n\n" +
        "Llave:\n" +
        "@NEQUIJUA78313\n\n" +
        "Titular:\n" +
        "ju** co**\n\n" +
        "Cuando realices el pago, amor ❤️, envíame el comprobante para verificarlo.",

        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "✅ Ya hice el pago",
                    "YA_PAGUE"
                )
            ],
            botonContacto()
        ])
    );

    await avisarAdmin(
        "💚 MÉTODO DE PAGO\n\n" +
        `👤 ${informacionUsuario(ctx).nombre}\n` +
        `🆔 ${ctx.from.id}\n\n` +
        "💚 Nequi",
        [
            [botonEscribirUsuario(ctx)]
        ]
    );
});

// =====================================================
// YA PAGUÉ
// =====================================================

bot.action("YA_PAGUE", async (ctx) => {
    await ctx.answerCbQuery();

    const usuario = obtenerUsuario(ctx);
    usuario.paso = "comprobante";

    await responder(
        ctx,
        "❤️ Perfecto, amor.\n\n" +
        "Ahora envíame el comprobante de pago por aquí.\n\n" +
        "📸 Puedes enviarlo como foto o 📄 documento.\n\n" +
        "Una vez recibido, será revisado manualmente.",

        Markup.inlineKeyboard([
            botonContacto()
        ])
    );

    const info = informacionUsuario(ctx);

    await avisarAdmin(
        "💰 EL USUARIO DICE QUE YA PAGÓ\n\n" +
        `👤 Nombre: ${info.nombre}\n` +
        `🔹 Username: ${info.username}\n` +
        `🆔 ID: ${info.id}\n\n` +
        `💳 Método: ${usuario.metodoPago || "No especificado"}\n` +
        `🛍️ Producto: ${productos[usuario.producto] || "No especificado"}\n\n` +
        "⚠️ Esperando comprobante.",
        [
            [botonEscribirUsuario(ctx)]
        ]
    );
});

// =====================================================
// RECIBIR COMPROBANTE - FOTO
// =====================================================

bot.on("photo", async (ctx) => {
    const usuario = obtenerUsuario(ctx);

    if (usuario.paso !== "comprobante") {
        return;
    }

    const foto =
        ctx.message.photo[
            ctx.message.photo.length - 1
        ];

    usuario.comprobanteRecibido = true;
    usuario.paso = "esperando_verificacion";

    const info = informacionUsuario(ctx);

    await responder(
        ctx,
        "❤️ Comprobante recibido.\n\n" +
        "Lo voy a revisar manualmente.\n\n" +
        "Cuando confirme el pago, recibirás la confirmación.",
        Markup.inlineKeyboard([
            botonContacto()
        ])
    );

    const aviso = await bot.telegram.sendPhoto(
        ADMIN_CHAT_ID,
        foto.file_id,
        {
            caption:
                "💰 NUEVO COMPROBANTE DE PAGO\n\n" +
                `👤 Nombre: ${info.nombre}\n` +
                `🔹 Username: ${info.username}\n` +
                `🆔 ID: ${info.id}\n\n` +
                `💳 Método: ${usuario.metodoPago || "No especificado"}\n` +
                `🛍️ Producto: ${productos[usuario.producto] || "No especificado"}\n\n` +
                "⚠️ Verifica el pago manualmente.",
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Verificar pago",
                        `VERIFICAR_${ctx.from.id}`
                    )
                ],
                [
                    botonEscribirUsuario(ctx)
                ]
            ])
        }
    );

    if (aviso?.message_id) {
        avisosAdmin.set(
            aviso.message_id,
            ctx.from.id
        );
    }
});

// =====================================================
// RECIBIR COMPROBANTE - DOCUMENTO
// =====================================================

bot.on("document", async (ctx) => {
    const usuario = obtenerUsuario(ctx);

    if (usuario.paso !== "comprobante") {
        return;
    }

    usuario.comprobanteRecibido = true;
    usuario.paso = "esperando_verificacion";

    const info = informacionUsuario(ctx);

    await responder(
        ctx,
        "❤️ Comprobante recibido.\n\n" +
        "Lo voy a revisar manualmente.\n\n" +
        "Cuando confirme el pago, recibirás la confirmación.",
        Markup.inlineKeyboard([
            botonContacto()
        ])
    );

    const aviso = await bot.telegram.sendDocument(
        ADMIN_CHAT_ID,
        ctx.message.document.file_id,
        {
            caption:
                "💰 NUEVO COMPROBANTE DE PAGO\n\n" +
                `👤 Nombre: ${info.nombre}\n` +
                `🔹 Username: ${info.username}\n` +
                `🆔 ID: ${info.id}\n\n` +
                `💳 Método: ${usuario.metodoPago || "No especificado"}\n` +
                `🛍️ Producto: ${productos[usuario.producto] || "No especificado"}\n\n` +
                "⚠️ Verifica el pago manualmente.",
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Verificar pago",
                        `VERIFICAR_${ctx.from.id}`
                    )
                ],
                [
                    botonEscribirUsuario(ctx)
                ]
            ])
        }
    );

    if (aviso?.message_id) {
        avisosAdmin.set(
            aviso.message_id,
            ctx.from.id
        );
    }
});

// =====================================================
// VERIFICAR PAGO MANUALMENTE
// =====================================================

bot.action(/^VERIFICAR_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_CHAT_ID) {
        return ctx.answerCbQuery(
            "No autorizado."
        );
    }

    await ctx.answerCbQuery(
        "Pago verificado ✅"
    );

    const userId = Number(ctx.match[1]);
    const usuario = usuarios.get(userId);

    if (!usuario) {
        return ctx.reply(
            "❌ No se encontró al usuario."
        );
    }

    usuario.pagoVerificado = true;
    usuario.paso = "menu";

    await bot.telegram.sendMessage(
        userId,
        "✅ PAGO VERIFICADO\n\n" +
        "Perfecto, amor ❤️\n\n" +
        "Tu pago fue verificado correctamente.\n\n" +
        "Ya puedes continuar con tu atención. 💎",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "💎 Ver opciones",
                    "CONTENIDO"
                )
            ],
            botonContacto()
        ])
    );

    await ctx.reply(
        `✅ Pago verificado correctamente para el usuario ${userId}.`
    );
});

// =====================================================
// CONVERSACIÓN PRINCIPAL
// =====================================================

bot.on("text", async (ctx, next) => {
    if (ctx.from.id === ADMIN_CHAT_ID) {
        return next();
    }

    const usuario = obtenerUsuario(ctx);
    const mensaje = ctx.message.text
        .trim()
        .toLowerCase();

    // -------------------------------------------------
    // RESPUESTAS GENERALES DE MENÚ
    // -------------------------------------------------

    if (
        mensaje.includes("precio") ||
        mensaje.includes("precios") ||
        mensaje.includes("contenido") ||
        mensaje.includes("pack") ||
        mensaje.includes("vip") ||
        mensaje.includes("videollamada") ||
        mensaje.includes("video personalizado")
    ) {
        return mostrarMenu(ctx);
    }

    // -------------------------------------------------
    // PASO 1
    // -------------------------------------------------

    if (usuario.paso === "como_estas") {
        usuario.paso = "origen";

        return responder(
            ctx,
            "Me alegro mucho, amor 🥰❤️\n\n" +
            "Yo estoy bien, gracias a Dios.\n\n" +
            "¿De dónde eres?"
        );
    }

    // -------------------------------------------------
    // PASO 2
    // -------------------------------------------------

    if (usuario.paso === "origen") {
        usuario.paso = "ocupacion";

        return responder(
            ctx,
            "Qué lindo 🥰\n\n" +
            "Yo soy de Colombia 🇨🇴, amor.\n\n" +
            "¿A qué te dedicas?"
        );
    }

    // -------------------------------------------------
    // PASO 3
    // -------------------------------------------------

    if (usuario.paso === "ocupacion") {
        usuario.paso = "edad";

        return responder(
            ctx,
            "Qué bien, amor 🥰\n\n" +
            "Yo tengo 21 años, mi cielo ❤️\n\n" +
            "¿Cuántos años tienes?"
        );
    }

    // -------------------------------------------------
    // PASO 4
    // -------------------------------------------------

    if (usuario.paso === "edad") {
        usuario.paso = "menu";

        await responder(
            ctx,
            "Perfecto, amor 🥰❤️"
        );

        return responder(
            ctx,
            "Amor ❤️, estas son mis opciones:",
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "💎 Ver opciones premium",
                        "PREMIUM"
                    )
                ],
                [
                    Markup.button.callback(
                        "🎥 Ver contenido",
                        "CONTENIDO"
                    )
                ],
                [
                    Markup.button.callback(
                        "💗 Novia virtual",
                        "NOVIA"
                    )
                ],
                botonContacto()
            ])
        );
    }

    // -------------------------------------------------
    // NOVIA VIRTUAL
    // -------------------------------------------------

    if (usuario.paso === "novia") {
        return responder(
            ctx,
            "Claro, amor 🥰❤️\n\n" +
            "Escríbeme directamente por aquí y hablamos personalmente.",
            Markup.inlineKeyboard([
                botonContacto()
            ])
        );
    }

    // -------------------------------------------------
    // RESPUESTA NORMAL
    // -------------------------------------------------

    return responder(
        ctx,
        "Cuéntame, amor 🥰❤️\n\n" +
        "También puedes elegir una de mis opciones:",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "💎 Ver opciones premium",
                    "PREMIUM"
                )
            ],
            [
                Markup.button.callback(
                    "🎥 Ver contenido",
                    "CONTENIDO"
                )
            ],
            [
                Markup.button.callback(
                    "💗 Novia virtual",
                    "NOVIA"
                )
            ],
            botonContacto()
        ])
    );
});

// =====================================================
// RESPUESTAS DEL ADMINISTRADOR
// =====================================================

bot.on("text", async (ctx) => {
    if (ctx.from.id !== ADMIN_CHAT_ID) {
        return;
    }

    const reply =
        ctx.message.reply_to_message;

    if (!reply) {
        return;
    }

    const clienteId =
        avisosAdmin.get(
            reply.message_id
        );

    if (!clienteId) {
        return;
    }

    try {
        await bot.telegram.sendMessage(
            clienteId,
            "💬 " + ctx.message.text
        );

        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            "✅ Mensaje enviado al cliente."
        );
    } catch (error) {
        console.error(
            "❌ Error contactando al cliente:",
            error.message
        );
    }
});

// =====================================================
// ERRORES
// =====================================================

bot.catch((error) => {
    console.error(
        "❌ Error general del bot:",
        error
    );
});

// =====================================================
// SERVIDOR PARA RENDER
// =====================================================

const PORT =
    process.env.PORT || 3000;

const server =
    http.createServer((req, res) => {
        res.writeHead(200, {
            "Content-Type":
                "text/plain; charset=utf-8"
        });

        res.end(
            "Nayeli VIP Bot funcionando correctamente ❤️"
        );
    });

server.listen(
    PORT,
    () => {
        console.log(
            `🌐 Servidor activo en puerto ${PORT}`
        );
    }
);

// =====================================================
// INICIAR BOT
// =====================================================

(async () => {
    try {
        console.log(
            "🚀 Iniciando Nayeli VIP Bot..."
        );

        await bot.telegram.deleteWebhook();

        await bot.launch({
            dropPendingUpdates: true
        });

        console.log(
            "✅ Bot conectado correctamente."
        );
    } catch (error) {
        console.error(
            "❌ Error iniciando bot:",
            error
        );
    }
})();

// =====================================================
// CIERRE SEGURO
// =====================================================

process.once(
    "SIGINT",
    () => {
        console.log(
            "🛑 Cerrando bot..."
        );

        bot.stop("SIGINT");
    }
);

process.once(
    "SIGTERM",
    () => {
        console.log(
            "🛑 Cerrando bot..."
        );

        bot.stop("SIGTERM");
    }
);