<script setup>
// A section's pages at a glance, as cards with the bot's own kit icons:
//   <TopicCards />
// The cards are the page's frontmatter `topics` ({ title, link, icon, text },
// icon a kit code copied to docs/public/emojis/<code>.png), so the markdown
// stays readable and /eggshen-ask's index (src/utils/docsIndex.js skips
// lone HTML tags) doesn't learn a card grid as documentation.
import { useData } from 'vitepress'
import { VPLink } from 'vitepress/theme'
import { inlineToHtml } from '../inline.js'

const { frontmatter } = useData()
</script>

<template>
  <nav v-if="frontmatter.topics?.length" class="topic-cards" aria-label="Pages in this section">
    <VPLink
      v-for="t in frontmatter.topics"
      :key="t.link"
      class="topic-card"
      :href="t.link"
      :no-icon="true"
    >
      <img :src="`/emojis/${t.icon}.png`" alt="" width="40" height="40" loading="lazy">
      <span class="topic-card-title">{{ t.title }}</span>
      <span class="topic-card-text" v-html="inlineToHtml(t.text)" />
    </VPLink>
  </nav>
</template>
