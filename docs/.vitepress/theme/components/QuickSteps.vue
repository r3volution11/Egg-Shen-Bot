<script setup>
// The "Quick steps" box at the top of a guide, drawn from the page's
// `howto` frontmatter. config.js turns the same frontmatter into the page's
// schema.org HowTo, so what readers see and what search engines read match.
import { computed } from 'vue'
import { useData } from 'vitepress'
import { inlineToHtml } from '../inline.js'

const { frontmatter } = useData()
const howto = computed(() => frontmatter.value.howto)
</script>

<template>
  <section v-if="howto" class="quick-steps" aria-labelledby="quick-steps-title">
    <p id="quick-steps-title" class="quick-steps-title">
      ⚡ Quick steps<span v-if="howto.timeText" class="quick-steps-time"> · about {{ howto.timeText }}</span>
    </p>
    <ol>
      <li v-for="(step, i) in howto.steps" :id="`step-${i + 1}`" :key="i">
        <strong>{{ step.name }}.</strong> <span v-html="inlineToHtml(step.text)" />
      </li>
    </ol>
  </section>
</template>
