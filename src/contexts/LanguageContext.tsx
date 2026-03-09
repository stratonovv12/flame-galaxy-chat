import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "ru" | "en";

const translations = {
  ru: {
    channels: "Каналы",
    groups: "Группы",
    chats: "Чаты",
    search: "Поиск",
    ai: "AI",
    profile: "Профиль",
    settings: "Настройки",
    marketplace: "Рынок",
    wallet: "Кошелёк",
    inventory: "Инвентарь",
    trades: "Трейды",
    logout: "Выйти из аккаунта",
    searchPlaceholder: "Поиск людей и каналов...",
    directMessages: "Личные сообщения",
    noMessages: "Нет сообщений",
    findPeople: "Найдите человека в поиске!",
    startConversation: "Начните разговор!",
    writeMessage: "Написать сообщение...",
    deleteChat: "Удалить чат",
    deleteAndBlock: "Удалить и заблокировать",
    chatDeleted: "Чат удалён",
    userBlocked: "заблокирован",
    language: "Язык",
    russian: "Русский",
    english: "English",
    displayName: "Отображаемое имя",
    displayNamePlaceholder: "Как вас зовут?",
    aboutMe: "О себе",
    aboutMePlaceholder: "Расскажите о себе...",
    email: "Email",
    accountCreated: "Аккаунт создан",
    steamIntegration: "Steam интеграция",
    steamRequired: "Необходим для покупки/продажи на маркетплейсе",
    adminPanel: "Панель администратора",
    backToProfile: "← Назад к профилю",
    loading: "Загрузка...",
    newChat: "Новый чат",
    chatHistory: "История чатов",
    askOrDraw: "Спросите или попросите нарисовать...",
    helloFlame: "Привет! Я FLAME AI",
    aiHint: "Задайте мне вопрос, отправьте фото для анализа или попросите сгенерировать изображение!",
    thinking: "Думаю...",
    imageGeneration: "Генерация изображения...",
    voiceMessage: "Голосовое сообщение",
    forwardMessage: "Переслать сообщение",
    forwardedFrom: "Переслано от",
    selectChat: "Выберите чат:",
    forwarded: "Сообщение переслано",
    reply: "Ответ",
    message: "Сообщение",
    missedCall: "Пропущенный вызов",
    user: "Пользователь",
    error: "Ошибка",
    blocked: "Вы заблокированы этим пользователем",
    userUnblocked: "Пользователь разблокирован",
    userBlockedAction: "Пользователь заблокирован",
    sendFailed: "Не удалось отправить",
    callFailed: "Не удалось начать вызов",
    typing: "печатает...",
  },
  en: {
    channels: "Channels",
    groups: "Groups",
    chats: "Chats",
    search: "Search",
    ai: "AI",
    profile: "Profile",
    settings: "Settings",
    marketplace: "Market",
    wallet: "Wallet",
    inventory: "Inventory",
    trades: "Trades",
    logout: "Sign Out",
    searchPlaceholder: "Search people and channels...",
    directMessages: "Direct Messages",
    noMessages: "No messages",
    findPeople: "Find someone in search!",
    startConversation: "Start a conversation!",
    writeMessage: "Write a message...",
    deleteChat: "Delete chat",
    deleteAndBlock: "Delete & Block",
    chatDeleted: "Chat deleted",
    userBlocked: "blocked",
    language: "Language",
    russian: "Русский",
    english: "English",
    displayName: "Display Name",
    displayNamePlaceholder: "What's your name?",
    aboutMe: "About Me",
    aboutMePlaceholder: "Tell about yourself...",
    email: "Email",
    accountCreated: "Account created",
    steamIntegration: "Steam Integration",
    steamRequired: "Required for marketplace buy/sell",
    adminPanel: "Admin Panel",
    backToProfile: "← Back to profile",
    loading: "Loading...",
    newChat: "New Chat",
    chatHistory: "Chat History",
    askOrDraw: "Ask or request an image...",
    helloFlame: "Hello! I'm FLAME AI",
    aiHint: "Ask me a question, send a photo for analysis, or request an image!",
    thinking: "Thinking...",
    imageGeneration: "Generating image...",
    voiceMessage: "Voice message",
    forwardMessage: "Forward message",
    forwardedFrom: "Forwarded from",
    selectChat: "Select chat:",
    forwarded: "Message forwarded",
    reply: "Reply",
    message: "Message",
    missedCall: "Missed call",
    user: "User",
    error: "Error",
    blocked: "You are blocked by this user",
    userUnblocked: "User unblocked",
    userBlockedAction: "User blocked",
    sendFailed: "Failed to send",
    callFailed: "Failed to start call",
    typing: "typing...",
  },
} as const;

type TranslationKey = keyof typeof translations.ru;

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("flame_lang");
    if (saved === "en" || saved === "ru") return saved;
    return navigator.language.startsWith("en") ? "en" : "ru";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("flame_lang", l);
  };

  const t = (key: TranslationKey): string => translations[lang][key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
