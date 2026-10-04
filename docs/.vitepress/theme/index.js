// .vitepress/theme/index.js
import DefaultTheme from 'vitepress/theme'
import QuickSteps from './components/QuickSteps.vue'
import FaqList from './components/FaqList.vue'
import DiscordMessage from './components/DiscordMessage.vue'
import DiscordCard from './components/DiscordCard.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Usable in any page: <QuickSteps /> and <FaqList /> read the page's frontmatter
    app.component('QuickSteps', QuickSteps)
    app.component('FaqList', FaqList)
    // Discord messages drawn in HTML, light and dark: <DiscordCard name="…" />
    app.component('DiscordMessage', DiscordMessage)
    app.component('DiscordCard', DiscordCard)
  },
}
