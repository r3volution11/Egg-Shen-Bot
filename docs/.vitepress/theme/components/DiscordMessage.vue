<script setup>
// One Discord message, drawn in HTML so it follows the docs' light/dark
// switch (Doug, 2026-10-03) — replacing screenshots that couldn't. The
// shape mirrors what the bot sends: an embed's title, description, fields,
// footer and thumbnail, then rows of buttons. Text is Discord markdown
// (discordMarkdown in ../inline.js). Styles: .dm-* in ../custom.css.
import { discordMarkdown } from '../inline.js'

defineProps({
  // { author, time, edited, ephemeral, command: { user, name }, content,
  //   embeds: [{ color, title, description, fields: [{ name, value, inline }],
  //   footer, timestamp, thumbnail: 'avatar' | 'poster' }],
  //   rows: [[{ label, kind: 'primary'|'secondary'|'success'|'danger', disabled }]] }
  message: { type: Object, required: true },
  // What a screen reader hears instead of a fake chat
  label: { type: String, required: true },
})

const md = discordMarkdown
const hex = (c) => (typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : c || 'var(--dm-embed-border)')
</script>

<template>
  <figure class="dm" role="img" :aria-label="label">
    <div class="dm-msg" :class="{ 'dm-ephemeral': message.ephemeral }">
      <div v-if="message.command" class="dm-reply" aria-hidden="true">
        <span class="dm-reply-line" />
        <span class="dm-reply-user">{{ message.command.user }}</span>
        <span class="dm-muted">used</span>
        <span class="dm-cmd">{{ message.command.name }}</span>
      </div>
      <div class="dm-row-main">
        <img class="dm-avatar" src="/logo.png" alt="" width="40" height="40">
        <div class="dm-body">
          <div class="dm-header">
            <span class="dm-author">{{ message.author || 'Egg Shen' }}</span>
            <span class="dm-app">✓ APP</span>
            <span class="dm-time">{{ message.time || 'Today at 8:05 PM' }}</span>
            <span v-if="message.edited" class="dm-edited">(edited)</span>
          </div>
          <div v-if="message.content" class="dm-content" v-html="md(message.content)" />
          <div
            v-for="(e, i) in message.embeds || []"
            :key="i"
            class="dm-embed"
            :style="{ borderLeftColor: hex(e.color) }"
          >
            <div class="dm-embed-main">
              <div v-if="e.title" class="dm-embed-title" v-html="md(e.title, { inline: true })" />
              <div v-if="e.description" class="dm-embed-desc" v-html="md(e.description)" />
              <div v-if="e.fields?.length" class="dm-fields">
                <div
                  v-for="(f, j) in e.fields"
                  :key="j"
                  class="dm-field"
                  :class="{ 'dm-field-inline': f.inline }"
                >
                  <div class="dm-field-name" v-html="md(f.name, { inline: true })" />
                  <div class="dm-field-value" v-html="md(f.value)" />
                </div>
              </div>
              <div v-if="e.footer || e.timestamp" class="dm-embed-footer">
                {{ [e.footer, e.timestamp].filter(Boolean).join(' • ') }}
              </div>
            </div>
            <div v-if="e.thumbnail" class="dm-thumb" :class="`dm-thumb-${e.thumbnail}`" aria-hidden="true">
              {{ e.thumbnail === 'avatar' ? '👤' : '🎬' }}
            </div>
          </div>
          <div v-for="(row, i) in message.rows || []" :key="`r${i}`" class="dm-buttons">
            <span
              v-for="(b, j) in row"
              :key="j"
              class="dm-btn"
              :class="[`dm-btn-${b.kind || 'secondary'}`, { 'dm-btn-disabled': b.disabled }]"
            >{{ b.label }}</span>
          </div>
          <div v-if="message.ephemeral" class="dm-ephemeral-note">
            👁 Only you can see this • <span class="dm-link">Dismiss message</span>
          </div>
        </div>
      </div>
    </div>
  </figure>
</template>
