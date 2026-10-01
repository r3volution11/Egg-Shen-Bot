<script setup>
// A page's questions and answers, drawn from its `faq` frontmatter.
// config.js turns the same list into the page's schema.org FAQPage.
import { computed } from 'vue'
import { useData } from 'vitepress'
import { inlineToHtml } from '../inline.js'

const { frontmatter } = useData()
const faq = computed(() => frontmatter.value.faq || [])
const slug = (q) => q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
</script>

<template>
  <div class="faq-list">
    <section v-for="item in faq" :key="item.q" class="faq-item">
      <h3 :id="slug(item.q)" tabindex="-1">
        {{ item.q }}
        <a class="header-anchor" :href="`#${slug(item.q)}`" :aria-label="`Permalink to ${item.q}`">&#8203;</a>
      </h3>
      <p v-html="inlineToHtml(item.a)" />
    </section>
  </div>
</template>
