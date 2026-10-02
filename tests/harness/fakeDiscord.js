/**
 * A fake Discord for driving the real command and handler code end to end.
 *
 * It is strict where real Discord is strict, because that is where the bugs
 * hide. discord.js throws if an interaction is answered twice, or followed up
 * before it was answered; a handler that never answers shows the user "This
 * interaction failed". The fakes in older tests allowed all of that, which is
 * how buttons that crashed in production passed their tests.
 *
 * Messages keep what the bot sent as real discord.js `Embed` and `ActionRow`
 * objects — the same classes a real `Message` holds — so code that reads them
 * back (`EmbedBuilder.from(message.embeds[0])`, `embed.title`) sees what it
 * would see in Discord.
 */

import { Embed, ActionRow, PermissionFlagsBits } from 'discord.js';

const EPHEMERAL = 64;

let nextId = 1000;
const snowflake = () => String(nextId++);

/** Builders and plain JSON alike, as the API would receive them. */
const toJSON = (x) => (x && typeof x.toJSON === 'function' ? x.toJSON() : x);

function isEphemeral(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.ephemeral === true) return true;
  const flags = payload.flags;
  if (typeof flags === 'number' || typeof flags === 'bigint') return (Number(flags) & EPHEMERAL) !== 0;
  if (Array.isArray(flags)) return flags.some(f => Number(f) === EPHEMERAL || f === 'Ephemeral');
  return false;
}

/** A message as Discord would store it. */
export class FakeMessage {
  constructor(channel, payload, { author = 'bot', ephemeralFor = null } = {}) {
    this.id = snowflake();
    this.channel = channel;
    this.channelId = channel?.id ?? null;
    this.author = author;
    this.ephemeralFor = ephemeralFor; // user id who alone can see it, or null
    // As Message.flags: code checks flags.has(MessageFlags.Ephemeral)
    const bits = ephemeralFor ? EPHEMERAL : 0;
    this.flags = { bitfield: bits, has: (f) => (Number(f) & bits) !== 0 && Number(f) !== 0 };
    this.content = '';
    this.embeds = [];
    this.components = [];
    this.attachments = [];
    this.history = [];
    this.deleted = false;
    this.apply(payload);
  }

  apply(payload) {
    const p = typeof payload === 'string' ? { content: payload } : (payload || {});
    if ('content' in p) this.content = p.content ?? '';
    if ('embeds' in p) this.embeds = (p.embeds || []).map(e => new Embed(toJSON(e)));
    if ('components' in p) this.components = (p.components || []).map(r => new ActionRow(toJSON(r)));
    if ('files' in p) this.attachments = p.files || [];
    this.history.push(this.snapshot());
  }

  async edit(payload) {
    if (this.deleted) throw new Error('Unknown Message');
    this.apply(payload);
    this.channel?.recordEdit?.(this);
    return this;
  }

  async delete() { this.deleted = true; }

  /** Every component on the message, flattened. */
  get allComponents() {
    return this.components.flatMap(row => row.components);
  }

  findComponent(customId) {
    return this.allComponents.find(c => c.customId === customId) || null;
  }

  /** Plain text of everything visible: content, titles, descriptions, fields, footers. */
  get text() {
    const parts = [this.content];
    for (const e of this.embeds) {
      const d = e.data || e.toJSON();
      parts.push(d.title, d.description, d.footer?.text, d.author?.name);
      for (const f of d.fields || []) parts.push(f.name, f.value);
    }
    return parts.filter(Boolean).join('\n');
  }

  snapshot() {
    return {
      content: this.content,
      embeds: this.embeds.map(e => e.toJSON()),
      components: this.components.map(r => r.toJSON()),
    };
  }
}

export class FakeChannel {
  constructor(guild, id, name = id) {
    this.guild = guild;
    this.id = id;
    this.name = name;
    this.messageList = [];
    this.isTextBased = () => true;
    const channel = this;
    this.messages = {
      async fetch(id) {
        const m = channel.messageList.find(x => x.id === id && !x.deleted);
        if (!m) throw Object.assign(new Error('Unknown Message'), { code: 10008 });
        return m;
      },
    };
  }

  async send(payload) {
    const msg = new FakeMessage(this, payload);
    this.messageList.push(msg);
    this.guild.discord.log({ kind: 'send', channel: this.id, message: msg });
    return msg;
  }

  recordEdit(msg) {
    this.guild.discord.log({ kind: 'edit', channel: this.id, message: msg });
  }

  /** Public messages, oldest first. */
  get posted() {
    return this.messageList.filter(m => !m.ephemeralFor && !m.deleted);
  }
}

export class FakeGuild {
  constructor(discord, id) {
    this.discord = discord;
    this.id = id;
    this.channelMap = new Map();
    const guild = this;
    this.channels = {
      async fetch(id) {
        const c = guild.channelMap.get(id);
        if (!c) throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
        return c;
      },
      cache: guild.channelMap,
    };
  }

  addChannel(id, name) {
    const c = new FakeChannel(this, id, name);
    this.channelMap.set(id, c);
    return c;
  }
}

/**
 * A member. `admin` holds Administrator, which (as in Discord) implies every
 * permission; a plain member holds none. Code asks with both string names
 * ('Administrator') and bigint flags (PermissionFlagsBits.Administrator).
 */
export function fakeMember(user, { admin = false, permissions = [], guildAvatar = null, nickname = null } = {}) {
  const held = new Set(permissions.map(p => (typeof p === 'bigint' ? p : PermissionFlagsBits[p])));
  return {
    user,
    id: user.id,
    displayName: nickname || user.username,
    // As GuildMember: the server avatar if set, else the account's
    displayAvatarURL: () => guildAvatar || user.displayAvatarURL(),
    roles: { cache: new Map() },
    permissions: {
      has(flag) {
        if (admin) return true;
        const bit = typeof flag === 'bigint' ? flag : PermissionFlagsBits[flag];
        return held.has(bit);
      },
    },
  };
}

/**
 * The interaction lifecycle, as discord.js enforces it
 * (InteractionResponses.js): answer once (reply / deferReply / update /
 * deferUpdate), then editReply / followUp — never before.
 */
class FakeInteraction {
  constructor(discord, { kind, user, member, guild, channel, message = null }) {
    this.discord = discord;
    this.kind = kind;
    this.id = snowflake();
    this.user = user;
    this.member = member;
    this.guild = guild;
    this.guildId = guild.id;
    this.channel = channel;
    this.channelId = channel.id;
    this.message = message;
    this.client = discord.client;
    this.deferred = false;
    this.replied = false;
    this.ephemeral = null;
    this.replyMessage = null; // the message editReply edits
    this.responses = []; // everything this interaction sent, in order
    this.edited = []; // messages it changed (editReply, update)
  }

  isChatInputCommand() { return this.kind === 'command'; }
  isAutocomplete() { return this.kind === 'autocomplete'; }
  isButton() { return this.kind === 'button'; }
  isStringSelectMenu() { return this.kind === 'select'; }
  isChannelSelectMenu() { return false; }
  isModalSubmit() { return false; }
  isRepliable() { return this.kind !== 'autocomplete'; }
  inGuild() { return true; }

  answered() { return this.deferred || this.replied; }

  fail(name) {
    const e = new Error(`${name}: ${name === 'InteractionAlreadyReplied'
      ? 'The reply to this interaction has already been sent or deferred.'
      : 'The reply to this interaction has not been sent or deferred.'}`);
    e.code = name;
    this.discord.violations.push(`${this.label()}: ${e.message}`);
    throw e;
  }

  label() {
    return this.kind === 'command' ? `/${this.commandName} ${this.subcommand || ''}`.trim() : `${this.kind} ${this.customId}`;
  }

  /** Post a message from this interaction: ephemeral to the user, or public in the channel. */
  post(payload) {
    const ephemeral = isEphemeral(payload);
    const msg = new FakeMessage(this.channel, payload, { ephemeralFor: ephemeral ? this.user.id : null });
    if (ephemeral) this.discord.ephemeral(this.user.id).push(msg);
    else this.channel.messageList.push(msg);
    this.responses.push(msg);
    this.discord.log({ kind: ephemeral ? 'ephemeral' : 'reply', channel: this.channel.id, to: this.user.id, via: this.label(), message: msg });
    return msg;
  }

  async reply(payload) {
    if (this.answered()) this.fail('InteractionAlreadyReplied');
    this.replied = true;
    this.ephemeral = isEphemeral(payload);
    this.replyMessage = this.post(payload);
    return payload?.fetchReply ? this.replyMessage : { id: this.id, interaction: this };
  }

  async deferReply(options = {}) {
    if (this.answered()) this.fail('InteractionAlreadyReplied');
    this.deferred = true;
    this.ephemeral = isEphemeral(options);
    // "Bot is thinking…" — the placeholder editReply later fills in
    this.replyMessage = this.post({ content: '', flags: this.ephemeral ? EPHEMERAL : 0 });
    return { id: this.id, interaction: this };
  }

  async editReply(payload) {
    if (!this.answered()) this.fail('InteractionNotReplied');
    const target = this.replyMessage;
    target.apply(payload);
    this.edited.push(target);
    this.discord.log({ kind: 'editReply', channel: this.channel.id, to: this.user.id, via: this.label(), message: target });
    return target;
  }

  async followUp(payload) {
    if (!this.answered()) this.fail('InteractionNotReplied');
    return this.post(payload);
  }

  async deleteReply() {
    if (this.replyMessage) this.replyMessage.deleted = true;
  }

  async fetchReply() {
    if (!this.answered()) this.fail('InteractionNotReplied');
    return this.replyMessage;
  }

  // Component interactions only

  async deferUpdate() {
    if (this.kind !== 'button' && this.kind !== 'select') throw new Error('deferUpdate on a non-component interaction');
    if (this.answered()) this.fail('InteractionAlreadyReplied');
    this.deferred = true;
    this.replyMessage = this.message; // editReply now edits the clicked message
    return { id: this.id, interaction: this };
  }

  async update(payload) {
    if (this.kind !== 'button' && this.kind !== 'select') throw new Error('update on a non-component interaction');
    if (this.answered()) this.fail('InteractionAlreadyReplied');
    this.replied = true;
    this.replyMessage = this.message;
    this.message.apply(payload);
    this.edited.push(this.message);
    this.discord.log({ kind: 'update', channel: this.channel.id, to: this.user.id, via: this.label(), message: this.message });
    return { id: this.id, interaction: this };
  }

  async showModal() {
    throw new Error('showModal: not emulated (nothing in the tournament flow uses modals)');
  }
}

function slashOptions({ subcommand = null, group = null, values = {}, focused = null }) {
  const get = (name) => (name in values ? values[name] : null);
  return {
    getSubcommand: (required = true) => {
      if (!subcommand && required) throw new Error('No subcommand');
      return subcommand;
    },
    getSubcommandGroup: () => group,
    getString: (name, required = false) => {
      const v = get(name);
      if (v == null && required) throw new Error(`Missing required option ${name}`);
      return v == null ? null : String(v);
    },
    getInteger: (name) => (get(name) == null ? null : Number(get(name))),
    getNumber: (name) => (get(name) == null ? null : Number(get(name))),
    getBoolean: (name) => (get(name) == null ? null : Boolean(get(name))),
    getAttachment: (name) => get(name),
    getChannel: (name) => get(name),
    getUser: (name) => get(name),
    getFocused: (full = false) => (full ? focused : focused?.value ?? ''),
    data: Object.entries(values).map(([name, value]) => ({ name, value })),
  };
}

/**
 * One guild, one channel by default, a bot user, and a log of everything
 * posted — the transcript a scenario can write out as HTML.
 */
export class FakeDiscord {
  constructor({ guildId = 'sim-guild', channelId = 'tournament-channel' } = {}) {
    this.events = [];
    this.violations = [];
    this.ephemerals = new Map();
    this.guild = new FakeGuild(this, guildId);
    this.channel = this.guild.addChannel(channelId, 'tournaments');
    const discord = this;
    const botUser = { id: 'bot', username: 'Egg Shen', bot: true, displayAvatarURL: () => 'https://cdn.example/bot.png' };
    this.client = {
      user: botUser,
      guilds: {
        async fetch(id) {
          if (id === discord.guild.id) return discord.guild;
          throw Object.assign(new Error('Unknown Guild'), { code: 10004 });
        },
        cache: new Map([[guildId, this.guild]]),
      },
      channels: {
        async fetch(id) {
          return discord.guild.channels.fetch(id);
        },
      },
    };
    this.users = new Map();
  }

  log(event) {
    this.events.push({ ...event, at: Date.now() });
  }

  ephemeral(userId) {
    if (!this.ephemerals.has(userId)) this.ephemerals.set(userId, []);
    return this.ephemerals.get(userId);
  }

  addUser(id, { admin = false, permissions = [], guildAvatar = null, nickname = null } = {}) {
    const user = { id, username: id, displayAvatarURL: () => `https://cdn.example/${id}.png` };
    const member = fakeMember(user, { admin, permissions, guildAvatar, nickname });
    this.users.set(id, { user, member });
    return user;
  }

  who(userId) {
    const u = this.users.get(userId);
    if (!u) throw new Error(`Unknown user ${userId}; addUser first`);
    return u;
  }

  /** A slash command interaction. */
  command(userId, commandName, { subcommand = null, group = null, options = {} } = {}) {
    const { user, member } = this.who(userId);
    const i = new FakeInteraction(this, { kind: 'command', user, member, guild: this.guild, channel: this.channel });
    i.commandName = commandName;
    i.subcommand = subcommand;
    i.options = slashOptions({ subcommand, group, values: options });
    return i;
  }

  autocomplete(userId, commandName, { subcommand, options = {}, focused }) {
    const { user, member } = this.who(userId);
    const i = new FakeInteraction(this, { kind: 'autocomplete', user, member, guild: this.guild, channel: this.channel });
    i.commandName = commandName;
    i.subcommand = subcommand;
    i.options = slashOptions({ subcommand, values: options, focused });
    i.choices = null;
    i.respond = async (choices) => { i.choices = choices; };
    return i;
  }

  /**
   * A click on a button that is really on `message`. Clicking something the
   * user couldn't (missing, disabled, someone else's ephemeral) is a test bug,
   * so it throws rather than quietly dispatching.
   */
  button(userId, message, customId) {
    const { user, member } = this.who(userId);
    if (message.ephemeralFor && message.ephemeralFor !== userId) {
      throw new Error(`${userId} can't see ${message.ephemeralFor}'s ephemeral message`);
    }
    const component = message.findComponent(customId);
    if (!component) {
      throw new Error(`No button "${customId}" on message. Buttons: ${message.allComponents.map(c => c.customId || c.url).join(', ') || 'none'}`);
    }
    if (component.disabled) throw new Error(`Button "${customId}" is disabled`);
    const i = new FakeInteraction(this, { kind: 'button', user, member, guild: this.guild, channel: message.channel || this.channel, message });
    i.customId = customId;
    i.component = component;
    return i;
  }

  /** A choice from a select menu that is really on `message`, by one of its own option values. */
  select(userId, message, customId, values) {
    const { user, member } = this.who(userId);
    const component = message.findComponent(customId);
    if (!component) throw new Error(`No select "${customId}" on message`);
    const offered = (component.options || component.data?.options || []).map(o => o.value);
    for (const v of values) {
      if (!offered.includes(v)) throw new Error(`"${v}" is not an option of ${customId}`);
    }
    const i = new FakeInteraction(this, { kind: 'select', user, member, guild: this.guild, channel: message.channel || this.channel, message });
    i.customId = customId;
    i.values = values;
    i.component = component;
    return i;
  }
}
