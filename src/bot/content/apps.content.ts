export type AppEntry = {
  name: string;
  description: string;
  url: string;
};

export type PlatformContent = {
  emoji: string;
  title: string;
  apps: AppEntry[];
  guide: string[];
};

export type PlatformKey = 'android' | 'ios' | 'windows' | 'mac' | 'linux';

export const platforms: Record<PlatformKey, PlatformContent> = {
  android: {
    emoji: '🤖',
    title: 'اندروید',
    apps: [
      {
        name: 'v2rayNG',
        description: 'رایج‌ترین و ساده‌ترین',
        url: 'https://github.com/2dust/v2rayNG/releases/latest',
      },
      {
        name: 'NekoBox',
        description: 'قدرتمندتر، رابط مدرن',
        url: 'https://github.com/MatsuriDayo/NekoBoxForAndroid/releases/latest',
      },
      {
        name: 'Hiddify',
        description: 'پشتیبانی از چند پروتکل',
        url: 'https://github.com/hiddify/hiddify-app/releases/latest',
      },
    ],
    guide: [
      'یکی از برنامه‌های بالا رو از لینکش دانلود و نصب کن',
      'وارد بخش «سرویس‌های من» تو ربات شو و کانفیگت رو باز کن',
      'روی دکمه «کپی لینک ساب» بزن',
      'برنامه VPN رو باز کن، روی + بزن و «Import from Clipboard» یا «وارد کردن از کلیپ‌بورد» رو انتخاب کن',
      'سرور رو انتخاب کن و دکمه اتصال رو بزن',
    ],
  },

  ios: {
    emoji: '🍎',
    title: 'آی‌اواس',
    apps: [
      {
        name: 'Streisand',
        description: 'توصیه می‌شه',
        url: 'https://apps.apple.com/app/streisand/id6450534064',
      },
      {
        name: 'FoXray',
        description: 'جایگزین خوب',
        url: 'https://apps.apple.com/app/foxray/id6448898396',
      },
      {
        name: 'Shadowrocket',
        description: 'حرفه‌ای، پولی',
        url: 'https://apps.apple.com/app/shadowrocket/id932747118',
      },
    ],
    guide: [
      'یکی از برنامه‌های بالا رو از اپ‌استور دانلود کن (ممکنه نیاز به اپل آی‌دی خارجی داشته باشی)',
      'لینک ساب کانفیگت رو از «سرویس‌های من» کپی کن',
      'برنامه رو باز کن و روی + بزن',
      '«Add from clipboard» یا گزینه مشابه رو بزن',
      'سرور رو انتخاب کن و اتصال رو فعال کن',
    ],
  },

  windows: {
    emoji: '🪟',
    title: 'ویندوز',
    apps: [
      {
        name: 'v2rayN',
        description: 'رایج‌ترین',
        url: 'https://github.com/2dust/v2rayN/releases/latest',
      },
      {
        name: 'Hiddify',
        description: 'رابط ساده',
        url: 'https://github.com/hiddify/hiddify-app/releases/latest',
      },
      {
        name: 'NekoRay',
        description: 'حرفه‌ای',
        url: 'https://github.com/MatsuriDayo/nekoray/releases/latest',
      },
    ],
    guide: [
      'یکی از برنامه‌های بالا رو دانلود و نصب کن (احتمالاً .NET رو هم می‌خواد)',
      'لینک ساب رو از ربات کپی کن',
      'تو برنامه، روی «Subscription» یا «اشتراک» کلیک کن',
      'URL ساب رو وارد کن و دکمه به‌روزرسانی رو بزن',
      'سرور دلخواه رو انتخاب و «Start» رو بزن',
    ],
  },

  mac: {
    emoji: '🍏',
    title: 'مک',
    apps: [
      {
        name: 'V2Box',
        description: 'رایگان از اپ‌استور',
        url: 'https://apps.apple.com/app/v2box-v2ray-client/id6446814690',
      },
      {
        name: 'Streisand',
        description: 'همون نسخه iOS',
        url: 'https://apps.apple.com/app/streisand/id6450534064',
      },
      {
        name: 'Hiddify',
        description: 'پشتیبانی کامل',
        url: 'https://github.com/hiddify/hiddify-app/releases/latest',
      },
    ],
    guide: [
      'یکی از برنامه‌های بالا رو نصب کن',
      'لینک ساب رو از ربات کپی کن',
      'تو برنامه روی + بزن و «Import from clipboard» رو انتخاب کن',
      'سرور رو انتخاب کن',
      'اتصال رو فعال کن',
    ],
  },

  linux: {
    emoji: '🐧',
    title: 'لینوکس',
    apps: [
      {
        name: 'Hiddify',
        description: 'ساده‌ترین، AppImage داره',
        url: 'https://github.com/hiddify/hiddify-app/releases/latest',
      },
      {
        name: 'NekoRay',
        description: 'کامل‌تر',
        url: 'https://github.com/MatsuriDayo/nekoray/releases/latest',
      },
      {
        name: 'v2rayA',
        description: 'وب‌بیس، خوب برای سرور',
        url: 'https://github.com/v2rayA/v2rayA',
      },
    ],
    guide: [
      'یکی از برنامه‌های بالا رو دانلود کن (Hiddify رو AppImage دانلود کن و executable کن)',
      'اجرا کن',
      'لینک ساب رو از ربات کپی کن',
      'تو برنامه گزینه import یا add subscription رو بزن',
      'سرور رو انتخاب و اتصال رو فعال کن',
    ],
  },
};

export const PLATFORM_SELECTION_TEXT =
  '📲 *دریافت نرم‌افزار اتصال*\n\n' +
  'سیستم‌عاملت رو انتخاب کن تا برنامه‌های پیشنهادی و راهنمای اتصال رو ببینی:';

export function formatPlatformMessage(p: PlatformContent): string {
  const appLines = p.apps
    .map((a) => `▫️ *${a.name}*\n${a.description}\n🔗 ${a.url}`)
    .join('\n\n');

  const guideLines = p.guide.map((step, i) => `${i + 1}. ${step}`).join('\n');

  return (
    `${p.emoji} *${p.title}*\n\n` +
    `📥 برنامه‌های پیشنهادی:\n\n` +
    `${appLines}\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `📖 راهنمای اتصال:\n\n` +
    `${guideLines}\n\n` +
    `💡 اگه مشکلی داشتی، از منوی «💬 پشتیبانی» با ما در ارتباط باش.`
  );
}
