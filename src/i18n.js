/**
 * i18n.js — all user-facing strings live here.
 * Keep both dictionaries in sync. Unknown keys fall back to English.
 */

const EN = {
  "brand.eyebrow": "STRESS RELIEF · BOXING",
  "brand.tagline": "Upload a face. Throw hands. Let it go.",
  "brand.local": "100% LOCAL",
  "brand.noAccount": "NO ACCOUNT",
  "brand.hint": "Mouse, touch or keyboard. Works best with a little aggression.",

  "mode.zen.name": "Zen",
  "mode.zen.short": "ZEN",
  "mode.zen.desc": "No clock. No score. Just hits.",
  "mode.timeAttack.name": "Time Attack",
  "mode.timeAttack.short": "TIME",
  "mode.timeAttack.desc": "Beat the clock. Pile up damage.",
  "mode.combo.name": "Combo",
  "mode.combo.short": "COMBO",
  "mode.combo.desc": "Keep the chain alive. One lapse ends it.",
  "mode.precision.name": "Precision",
  "mode.precision.short": "AIM",
  "mode.precision.desc": "Hit the target. Drift costs points.",

  "upload.chooseMode": "Choose your round",
  "upload.photoTitle": "Add your face",
  "upload.addPhoto": "Add a photo",
  "upload.addPhotoAria": "Upload a photo to put on the punching bag",
  "upload.photoHint": "JPG / PNG · stays on this device",
  "upload.change": "Change",
  "upload.remove": "Remove photo",
  "upload.style": "Photo style",
  "upload.full": "Full body",
  "upload.portrait": "Portrait",
  "upload.duration": "Round length",
  "upload.localNote": "Photo stays in memory only. Refresh clears it.",
  "upload.start": "Enter the ring",
  "upload.startNoPhoto": "No photo? No problem. The bag is already waiting.",

  "hud.time": "TIME",
  "hud.combo": "COMBO",
  "hud.score": "SCORE",
  "hud.pause": "Pause",
  "hud.mute": "Mute sound",
  "hud.unmute": "Unmute sound",
  "hud.language": "Switch language",
  "hud.settings": "Settings",

  "privacy.short": "Photos are processed locally in your browser and never uploaded.",
  "privacy.long":
    "Your photo is read with the browser's local file API, drawn into a canvas and attached to the 3D bag. It never leaves this device and is never written to storage.",
  "footer.credit": "No backend. No account. No excuses.",

  "result.title": "ROUND OVER",
  "result.newBest": "NEW PERSONAL BEST",
  "result.score": "SCORE",
  "result.bestCombo": "Best combo",
  "result.hits": "Hits",
  "result.best": "Personal best",
  "result.replay": "Run it back",
  "result.changeMode": "Change mode",
  "result.changePhoto": "Change photo",

  "pause.eyebrow": "TAKE A BREATH",
  "pause.title": "PAUSED",
  "pause.sub": "The bag isn't going anywhere.",
  "pause.resume": "Resume",
  "pause.restart": "Restart",
  "pause.finish": "End round",
  "pause.quit": "Quit to menu",

  "settings.title": "Settings",
  "settings.close": "Close settings",
  "settings.language": "Language",
  "settings.sound": "Sound",
  "settings.soundOn": "Sound on",
  "settings.soundOff": "Sound off",
  "settings.duration": "Round length",
  "settings.photoStyle": "Photo style",
  "settings.shortcuts": "Controls",
  "settings.privacyTitle": "Privacy",
  "settings.resetBest": "Reset personal bests",
  "settings.resetConfirm": "Tap again to confirm",

  "shortcuts.hint": "J / K / Space punch · ← → aim · Esc pause",
  "shortcuts.touch": "Tap for a jab. Swipe fast for a hook or uppercut. Hold to keep punching.",

  "precision.perfect": "PERFECT",
  "precision.good": "GOOD",
  "precision.miss": "MISS",

  "toast.invalidImage": "That file isn't an image. Try JPG, PNG or WebP.",
  "toast.imageError": "Couldn't read that image. Try a different file.",
  "toast.photoReady": "Photo loaded — it stays on this device.",
  "toast.photoRemoved": "Photo removed.",
  "toast.reset": "Personal bests cleared.",
  "toast.webgl": "WebGL couldn't start. Try a newer browser or enable hardware acceleration.",

  "texture.upload": "UPLOAD PHOTO",
  "texture.sub": "YOUR FACE HERE",
  "texture.brand": "STRESS PUNCH",
};

const ZH = {
  "brand.eyebrow": "解压 · 拳击",
  "brand.tagline": "上传一张照片。挥出你的拳头。把压力打出去。",
  "brand.local": "100% 本地",
  "brand.noAccount": "无需账号",
  "brand.hint": "鼠标、触摸或键盘都可以。带点狠劲手感更好。",

  "mode.zen.name": "解压模式",
  "mode.zen.short": "解压",
  "mode.zen.desc": "没有计时，没有分数，只有出拳。",
  "mode.timeAttack.name": "计时挑战",
  "mode.timeAttack.short": "计时",
  "mode.timeAttack.desc": "和时间对打，尽可能多拿分。",
  "mode.combo.name": "连击模式",
  "mode.combo.short": "连击",
  "mode.combo.desc": "保持连击不断，一旦中断立即结算。",
  "mode.precision.name": "精准模式",
  "mode.precision.short": "精准",
  "mode.precision.desc": "击中靶心拿高分，打偏会扣分。",

  "upload.chooseMode": "选择你的回合",
  "upload.photoTitle": "贴上你的脸",
  "upload.addPhoto": "添加照片",
  "upload.addPhotoAria": "上传一张照片贴到沙包上",
  "upload.photoHint": "JPG / PNG · 只在本机处理",
  "upload.change": "更换",
  "upload.remove": "移除照片",
  "upload.style": "照片贴法",
  "upload.full": "全身",
  "upload.portrait": "头像",
  "upload.duration": "回合时长",
  "upload.localNote": "照片只保存在内存中，刷新后需要重新上传。",
  "upload.start": "进入拳台",
  "upload.startNoPhoto": "没有照片也能玩，沙包已经就位。",

  "hud.time": "时间",
  "hud.combo": "连击",
  "hud.score": "得分",
  "hud.pause": "暂停",
  "hud.mute": "静音",
  "hud.unmute": "取消静音",
  "hud.language": "切换语言",
  "hud.settings": "设置",

  "privacy.short": "照片仅在浏览器本地处理，不会上传到服务器。",
  "privacy.long":
    "照片通过浏览器本地文件接口读取，绘制到 Canvas 后贴到 3D 沙包上。照片不会离开这台设备，也不会写入任何存储。",
  "footer.credit": "没有后端，没有账号，没有借口。",

  "result.title": "回合结束",
  "result.newBest": "新的个人最佳",
  "result.score": "得分",
  "result.bestCombo": "最高连击",
  "result.hits": "命中数",
  "result.best": "本模式最佳",
  "result.replay": "再来一局",
  "result.changeMode": "换模式",
  "result.changePhoto": "换照片",

  "pause.eyebrow": "喘口气",
  "pause.title": "已暂停",
  "pause.sub": "沙包不会跑。",
  "pause.resume": "继续",
  "pause.restart": "重新开始",
  "pause.finish": "结束回合",
  "pause.quit": "返回菜单",

  "settings.title": "设置",
  "settings.close": "关闭设置",
  "settings.language": "语言",
  "settings.sound": "声音",
  "settings.soundOn": "声音开启",
  "settings.soundOff": "声音关闭",
  "settings.duration": "回合时长",
  "settings.photoStyle": "照片贴法",
  "settings.shortcuts": "操作方式",
  "settings.privacyTitle": "隐私",
  "settings.resetBest": "清除个人最佳",
  "settings.resetConfirm": "再点一次确认",

  "shortcuts.hint": "J / K / 空格 出拳 · ← → 调整角度 · Esc 暂停",
  "shortcuts.touch": "点击出刺拳，快速滑动出勾拳或上勾拳，按住可以连续击打。",

  "precision.perfect": "完美",
  "precision.good": "不错",
  "precision.miss": "打偏",

  "toast.invalidImage": "这不是图片文件，请选择 JPG、PNG 或 WebP。",
  "toast.imageError": "图片读取失败，换一张试试。",
  "toast.photoReady": "照片已加载，只保存在本机。",
  "toast.photoRemoved": "照片已移除。",
  "toast.reset": "个人最佳已清除。",
  "toast.webgl": "WebGL 启动失败。请使用较新的浏览器，或开启硬件加速。",

  "texture.upload": "上传照片",
  "texture.sub": "你的照片在这里",
  "texture.brand": "STRESS PUNCH",
};

export const DICTIONARIES = { en: EN, zh: ZH };
export const SUPPORTED_LANGS = Object.keys(DICTIONARIES);

/** Pick a sensible default from the browser, Chinese only for zh-* locales. */
export function detectLanguage() {
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en"];
  for (const code of candidates) {
    if (/^zh\b/i.test(code) || /^zh-/i.test(code)) return "zh";
  }
  return "en";
}

export function t(lang, key, vars) {
  const dict = DICTIONARIES[lang] || DICTIONARIES.en;
  let value = dict[key];
  if (value === undefined) value = DICTIONARIES.en[key];
  if (value === undefined) return key;
  if (vars) {
    return value.replace(/\{(\w+)\}/g, (_, name) =>
      vars[name] === undefined ? `{${name}}` : String(vars[name]),
    );
  }
  return value;
}

/**
 * Apply translations to all data-i18n nodes under `root`.
 * data-i18n → textContent, data-i18n-title → title, data-i18n-aria → aria-label.
 */
export function applyTranslations(lang, root = document) {
  const dict = DICTIONARIES[lang] || DICTIONARIES.en;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const value = dict[key] ?? DICTIONARIES.en[key];
    if (value !== undefined) el.textContent = value;
  });

  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const value = dict[key] ?? DICTIONARIES.en[key];
    if (value !== undefined) el.setAttribute("title", value);
  });

  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    const value = dict[key] ?? DICTIONARIES.en[key];
    if (value !== undefined) el.setAttribute("aria-label", value);
  });
}
