import { createI18n } from 'vue-i18n'
import messages from '../../../locales/en.json'

const availableLocales = [{ key: 'en', label: 'English' }]

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: messages }
})

export { availableLocales }
export default i18n
