// .vitepress/theme/index.js
import DefaultTheme from 'vitepress/theme'
import { inBrowser, useRouter } from 'vitepress'
import { onMounted } from 'vue'
import QuickSteps from './components/QuickSteps.vue'
import FaqList from './components/FaqList.vue'
import DiscordMessage from './components/DiscordMessage.vue'
import DiscordCard from './components/DiscordCard.vue'
import TopicCards from './components/TopicCards.vue'
import { movedTo } from './movedAnchors.js'
import './custom.css'

/**
 * An old link to a section that has moved (movedAnchors.js) goes straight
 * to its new page. The address is replaced, not pushed, so Back doesn't
 * bounce the reader forward again.
 */
function followMoved(router) {
  const to = movedTo(location.pathname, location.hash)
  if (!to) return
  history.replaceState(history.state, '', to)
  router.go(to)
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    // Usable in any page: <QuickSteps /> and <FaqList /> read the page's frontmatter
    app.component('QuickSteps', QuickSteps)
    app.component('FaqList', FaqList)
    // Discord messages drawn in HTML, light and dark: <DiscordCard name="…" />
    app.component('DiscordMessage', DiscordMessage)
    app.component('DiscordCard', DiscordCard)
    // A section's pages as cards: <TopicCards /> reads the page's `topics`
    app.component('TopicCards', TopicCards)
    if (inBrowser) {
      const after = router.onAfterRouteChange
      router.onAfterRouteChange = async (href) => {
        await after?.(href)
        followMoved(router)
      }
    }
  },
  setup() {
    // The first page load isn't a route change
    const router = useRouter()
    onMounted(() => followMoved(router))
  },
}
