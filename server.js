require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const botToken = process.env.CHAT_API;

if (!botToken) {
  throw new Error('Le token du bot est introuvable. Vérifiez la variable d’environnement CHAT_API.');
}

const bot = new Telegraf(botToken);
const urlsFilePath = path.resolve(__dirname, 'urls.txt');
const imagePath = path.resolve(__dirname, 'images/1.jpg');

function lireCanaux() {
  if (!fs.existsSync(urlsFilePath)) {
    console.warn(`Fichier ${urlsFilePath} introuvable. Aucun bouton ne sera généré.`);
    return [];
  }

  return fs
    .readFileSync(urlsFilePath, 'utf-8')
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter(Boolean);
}

const canalUrls = lireCanaux();

const liensSucces = (process.env.SUCCESS_URL || '')
  .split(',')
  .map((element) => element.trim())
  .filter(Boolean);

function urlLisible(url, index) {
  const propre = url.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return propre ? `Canal ${index + 1} • ${propre}` : `Canal ${index + 1}`;
}

function normaliserUrl(url) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (/^t\.me\//i.test(url)) {
    return `https://${url}`;
  }
  if (url.startsWith('@')) {
    return `https://t.me/${url.slice(1)}`;
  }
  return url;
}

function extraireIdentifiantChat(url) {
  const nettoye = url.trim();
  if (!nettoye) {
    return null;
  }

  if (/^-?\d+$/.test(nettoye)) {
    return nettoye;
  }

  if (nettoye.startsWith('@')) {
    return nettoye;
  }

  const match = nettoye.match(/t\.me\/(?:joinchat\/|\+)?([\w\d_]+)/i);
  if (match && match[1]) {
    const identifiant = match[1];
    if (nettoye.includes('joinchat') || nettoye.includes('+')) {
      return null;
    }
    return `@${identifiant}`;
  }

  return null;
}

function construireClavierCanaux() {
  const boutons = canalUrls.map((url, index) => [
    Markup.button.url(urlLisible(url, index), normaliserUrl(url)),
  ]);

  boutons.push([Markup.button.callback('Vérifier', 'verify_channels')]);
  return boutons;
}

const clavierCanaux = construireClavierCanaux();

bot.start(async (ctx) => {
  const username =
    ctx.from?.username
      ? `@${ctx.from.username}`
      : [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'cher membre';

  const message = [
    `Salut ${username},
    Ɑνᥲᥒt Ꮷᥱ ρoυνoιɾ tᥱ́ᥣᥱ́ᥴhᥲɾɡᥱɾ νotɾᥱ 𝖿ιᥴhιᥱɾ, Vᥱυιᥣᥣᥱᴢ Ꮷ'ᥲᑲoɾᏧ ɾᥱȷoιᥒᏧɾᥱ ɱᥱs ᥴᥲᥒᥲυx.`,

    'Sᥱυᥣᥱs ᥣᥱs ρᥱɾsoᥒᥒᥱs ᥲᑲoᥒᥒᥱ́ᥱs ᥲ̀ ɱᥱs ᥴᥲᥒᥲυx o𝖿𝖿ιᥴιᥱᥣs ᥴι-Ꮷᥱssoυs ρᥱυνᥱᥒt ᥱ𝖿𝖿ᥱᥴtυᥱɾ Ꮷᥱs tᥱ́ᥣᥱ́hᥲɾɡᥱɱᥱᥒts..',
  ].join('\n');

  try {
    if (fs.existsSync(imagePath)) {
      await ctx.replyWithPhoto(
        { source: imagePath },
        {
          caption: message,
          reply_markup: {
            inline_keyboard: clavierCanaux,
          },
        }
      );
    } else {
      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: clavierCanaux,
        },
      });
    }
  } catch (error) {
    console.error("Erreur lors de l'envoi du message de bienvenue :", error);
  }
});

bot.action('verify_channels', async (ctx) => {
  await ctx.answerCbQuery('Vérification en cours...');

  const utilisateurId = ctx.from?.id;
  if (!utilisateurId) {
    await ctx.reply("Impossible d'identifier votre compte pour la vérification.");
    return;
  }

  const manquants = [];

  for (const url of canalUrls) {
    const identifiant = extraireIdentifiantChat(url);
    if (!identifiant) {
      manquants.push(url);
      continue;
    }

    try {
      const membre = await ctx.telegram.getChatMember(identifiant, utilisateurId);
      if (!membre || ['left', 'kicked'].includes(membre.status)) {
        manquants.push(url);
      }
    } catch (erreur) {
      console.error(`Erreur lors de la vérification du canal ${identifiant} :`, erreur);
      manquants.push(url);
    }
  }

  if (manquants.length === 0) {
    const confirmation = 'Génial ! ✅ Vous avez rejoint tous les canaux.';

    if (liensSucces.length > 0) {
      const boutonsSucces = liensSucces.map((lien, index) => [
        Markup.button.url(
          `Accéder ${index + 1}`,
          normaliserUrl(lien)
        ),
      ]);

      await ctx.reply(confirmation, {
        reply_markup: {
          inline_keyboard: boutonsSucces,
        },
      });
    } else {
      await ctx.reply(confirmation);
    }
  } else {
    const texteManquants = manquants
      .map((url) => `• ${normaliserUrl(url)}`)
      .join('\n');

    await ctx.reply(
      [
        "Il semble que vous n'ayez pas encore rejoint tous les canaux requis.",
        '',
        'Canaux manquants :',
        texteManquants,
        '',
        'Rejoignez-les puis appuyez à nouveau sur « Vérifier ».',
      ].join('\n')
    );
  }
});

bot.catch((erreur) => {
  console.error('Erreur Telegraf :', erreur);
});

bot.launch().then(() => {
  console.log('Bot démarré avec succès.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
