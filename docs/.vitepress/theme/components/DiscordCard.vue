<script setup>
// A named example Discord message from ../discordCards.js:
//   <DiscordCard name="voting-dashboard" />
// One line in the page, so the markdown stays readable and the bot's
// /eggshen-ask index (src/utils/docsIndex.js skips lone HTML tags) doesn't
// learn fake chat as documentation.
import { computed } from 'vue'
import DiscordMessage from './DiscordMessage.vue'
import { DISCORD_CARDS } from '../discordCards.js'

const props = defineProps({ name: { type: String, required: true } })
const card = computed(() => DISCORD_CARDS[props.name])
</script>

<template>
  <DiscordMessage v-if="card" :message="card.message" :label="card.label" />
  <p v-else class="dm-missing">Missing Discord example "{{ name }}"</p>
</template>
