<script setup>
// One "see it in action" row on the home page: a kit-icon label, a heading,
// a sentence or two with links (the default slot, written as markdown in
// index.md, so VitePress still checks the links), and the visual beside it.
//
//   <HomeShowcase id="siege" icon="siege" kicker="Siege" title="…"
//     cards="siege-card" flip>
//
// The visual is either a picture the bot draws (`image`, its own stone
// frame, shown as is) or example Discord messages (`cards`, space-separated
// names from discordCards.js, gameCards.js or homeCards.js) on a dark
// "drive-in screen". `peek` crops a tall last message with a fade, and
// `items` adds a row of kit icons under the screen. Styles: .eh-* in
// ../custom.css.
import { computed } from 'vue'
import { withBase } from 'vitepress'
import DiscordMessage from './DiscordMessage.vue'
import { DISCORD_CARDS } from '../discordCards.js'
import { HOME_CARDS } from '../homeCards.js'

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  kicker: { type: String, default: '' },
  // A kit code: docs/public/emojis/<icon>.png
  icon: { type: String, default: '' },
  // A picture the bot draws, from docs/public
  image: { type: String, default: '' },
  alt: { type: String, default: '' },
  width: { type: [Number, String], default: 960 },
  height: { type: [Number, String], default: 540 },
  cards: { type: String, default: '' },
  peek: { type: Boolean, default: false },
  // "gpie:Golden Pie, vhs:Cursed VHS": kit icons with their names
  items: { type: String, default: '' },
  itemsLabel: { type: String, default: '' },
  // Visual on the left instead of the right (wide screens only)
  flip: { type: Boolean, default: false },
})

const messages = computed(() => props.cards.split(/\s+/).filter(Boolean)
  .map((name) => ({ name, card: HOME_CARDS[name] || DISCORD_CARDS[name] })))

const itemList = computed(() => props.items.split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [code, name] = s.split(':'); return { code, name } }))

const kit = (code) => withBase(`/emojis/${code}.png`)
</script>

<template>
  <section class="eh-show" :class="{ 'eh-flip': flip }" :aria-labelledby="id">
    <div class="eh-show-text">
      <p v-if="kicker" class="eh-kicker">
        <img v-if="icon" :src="kit(icon)" alt="" width="32" height="32">
        <span>{{ kicker }}</span>
      </p>
      <h2 :id="id" tabindex="-1">{{ title }}</h2>
      <slot />
    </div>

    <div class="eh-show-visual">
      <img
        v-if="image"
        class="eh-picture"
        :src="withBase(image)"
        :alt="alt"
        :width="width"
        :height="height"
        loading="lazy"
      >
      <div v-else class="eh-screen" :class="{ 'eh-peek': peek }">
        <i class="eh-gem eh-gem-tl" aria-hidden="true" />
        <i class="eh-gem eh-gem-tr" aria-hidden="true" />
        <i class="eh-gem eh-gem-bl" aria-hidden="true" />
        <i class="eh-gem eh-gem-br" aria-hidden="true" />
        <!-- The messages scroll inside the frame, so a peek can clip them
             without clipping the gems that sit on its corners -->
        <div class="eh-reel">
          <template v-for="m in messages" :key="m.name">
            <DiscordMessage v-if="m.card" :message="m.card.message" :label="m.card.label" />
            <p v-else class="dm-missing">Missing Discord example "{{ m.name }}"</p>
          </template>
        </div>
      </div>
      <div v-if="itemList.length" class="eh-items">
        <span v-if="itemsLabel" class="eh-items-label">{{ itemsLabel }}</span>
        <ul>
          <li v-for="it in itemList" :key="it.code">
            <img :src="kit(it.code)" :alt="it.name" :title="it.name" width="44" height="44" loading="lazy">
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
