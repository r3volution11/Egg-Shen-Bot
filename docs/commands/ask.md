---
title: Ask the Bot (/eggshen-ask) - Egg Shen Bot
description: "Ask Egg Shen Bot how to do something in plain words with /eggshen-ask, and get the exact commands to run, answered from its own documentation."
howto:
  name: Ask the bot how to do something
  timeText: a few seconds
  totalTime: PT1M
  steps:
    - name: Ask in your own words
      text: Run `/eggshen-ask question:how do I start a watch party timer?`
    - name: Read the answer
      text: The bot replies with the exact command to run, and links to the docs page it came from. Only you see it.
    - name: Share it if it helps someone
      text: Add `public:true` to post the answer in the channel for everyone.
---

# Ask the Bot

Not sure which command does what you want? Ask in plain words. `/eggshen-ask` answers from this documentation, with the exact commands to run.

<QuickSteps />

## Examples

```
/eggshen-ask question:I want to set up a tournament with 16 titles
/eggshen-ask question:how do I start a matchup between two titles?
/eggshen-ask question:how do I pause the timer?
/eggshen-ask question:how can members request a watch party event?
/eggshen-ask question:how do I stop people spamming the bot?
```

## Tips

- **Describe what you want to do,** not the command you think it is. "Run the tournament one matchup at a time" works better than "bracket open".
- **Answers are private** unless you add `public:true`. That's handy when helping someone in the channel.
- **Some answers need an admin.** If a command is for administrators and moderators only, the answer says so.
- **Follow the link** under the answer for the full page, with every option.

## How it works

1. **It finds the closest parts of the docs.** That includes every command page, feature page and guide (not the changelog or the self-hosting setup pages).
2. **It writes the answer.** With AI answers on, the bot writes a short answer from those parts of the docs, and from a list of its real commands. With AI answers off, it shows the best-matching part of the docs as written.
3. **It checks every command before you see it.** Each command in an AI answer is checked against the bot's real commands, including their options. An answer that names a command that doesn't exist is thrown away, and you get the docs section instead.
4. **It links its source,** so you can read the full page.

If nothing in the docs answers your question, it says so rather than guessing.

## AI answers

AI answers have their own switch, separate from [AI announcement text](/configuration#ai-announcement-text). They're on by default, and need the bot to have an OpenAI API key.

```
/eggshen-config-ai ai-ask feature-toggle enabled:false
/eggshen-config-ai ai-ask view
```

Without AI, `/eggshen-ask` still works: it shows the best-matching section of the docs.

::: tip Self-hosting
There's nothing to set up beyond `OPENAI_API_KEY`. The bot reads the `docs/` folder it ships with, so answers always match your version. The first AI question embeds the docs for search (a fraction of a cent, cached in `docs_embeddings.json`); after that, each question costs well under a tenth of a cent.
:::
