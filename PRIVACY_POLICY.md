# Privacy Policy for Egg Shen Bot

**Last Updated: June 15, 2026**

## 1. Introduction

This Privacy Policy explains how Egg Shen Bot ("the Bot", "we", "us") collects, uses, and protects your information when you use our Discord bot service.

## 2. Information We Collect

### 2.1 Discord User Information
When you interact with the Bot, we may temporarily process:
- Discord User ID (for command execution and permission checks)
- Discord Username (for display in timer and statistics features)
- Discord Server (Guild) ID (for server-specific configurations)
- Discord Channel ID (for timer functionality)

### 2.2 Server Configuration Data
For servers where the Bot is installed, we store:
- Server (Guild) ID
- Service toggle preferences (which rating services to display)
- Custom emoji settings
- Command permission settings
- Statistics tracking preferences

This data is stored in JSON files on our server and is specific to each Discord server.

### 2.3 Usage Statistics (Optional)
If enabled by server administrators, we collect:
- User IDs and usernames of users who perform searches
- Titles and years of movies, TV shows, and episodes searched
- Timestamps of searches
- Search counts per user and per title

**Important:** Server administrators can disable statistics tracking at any time using `/eggshen-config stats-toggle` commands.

### 2.4 Timer Data (Temporary)
When users create timers, we temporarily store in memory:
- Channel ID
- User ID and username who started the timer
- Timer start time
- Optional timer label

**Note:** Timer data is only stored in memory and is lost when the Bot restarts. We do not permanently store timer information.

### 2.5 Search Queries
Search queries (movie titles, TV show names, episode names) are sent to third-party APIs but are not permanently stored by the Bot.

## 3. How We Use Information

We use the collected information to:
- Execute bot commands and provide requested information
- Maintain server-specific configuration preferences
- Track usage statistics (when enabled by administrators)
- Manage channel timers
- Enforce permission and access controls
- Improve the Bot's functionality

## 4. Data Storage and Security

### 4.1 Storage Location
- Configuration data is stored in JSON files in the `guild_configs/` directory
- Statistics data is stored in JSON files in the `guild_stats/` directory
- Timer data is stored temporarily in memory only
- All data is stored on our server infrastructure

### 4.2 Security Measures
We implement reasonable security measures to protect stored data, including:
- Access controls to server infrastructure
- Secure handling of Discord API tokens
- No storage of sensitive personal information

### 4.3 Data Retention
- **Configuration data:** Retained until the Bot is removed from a server or manually deleted
- **Statistics data:** Retained until cleared by administrators using `/eggshen-config stats-clear`
- **Timer data:** Automatically cleared when the Bot restarts or when timers are stopped

## 5. Third-Party Services

The Bot interacts with the following third-party services:

### 5.1 Discord
The Bot operates on Discord's platform and is subject to [Discord's Privacy Policy](https://discord.com/privacy).

### 5.2 The Movie Database (TMDB)
Search queries are sent to TMDB's API. See [TMDB's Privacy Policy](https://www.themoviedb.org/privacy-policy).

### 5.3 Open Movie Database (OMDB)
Rating requests are sent to OMDB's API. See [OMDB's Terms](http://www.omdbapi.com/legal.htm).

### 5.4 Trakt
Rating requests are sent to Trakt's API. See [Trakt's Privacy Policy](https://trakt.tv/privacy).

**We do not control these third-party services and are not responsible for their privacy practices.**

## 6. Data Sharing

We do NOT:
- Sell your data to third parties
- Share your data with advertisers
- Use your data for marketing purposes
- Share statistics or user data between different servers

We only share data as necessary to operate the Bot (e.g., sending search queries to TMDB API).

## 7. Your Rights and Choices

### 7.1 Server Administrators Can:
- Disable statistics tracking: `/eggshen-config stats-toggle setting:enabled enabled:false`
- Clear all statistics: `/eggshen-config stats-clear`
- Control which commands users can access
- Remove the Bot from their server at any time (which deletes all associated data)

### 7.2 All Users Can:
- Stop using the Bot commands at any time
- Request data deletion by removing the Bot from their server (for administrators)

### 7.3 Data Deletion
To delete all data associated with your server:
1. Use `/eggshen-config stats-clear` to delete statistics
2. Remove the Bot from your server (this will delete configuration files)

Alternatively, contact us to request manual data deletion.

## 8. Children's Privacy

The Bot does not knowingly collect information from children under 13. The Bot is intended for use in accordance with Discord's Terms of Service, which require users to be 13 or older (or older in some jurisdictions).

## 9. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. Changes will be reflected by updating the "Last Updated" date. Continued use of the Bot after changes constitutes acceptance of the updated policy.

## 10. Data Breach Notification

In the unlikely event of a data breach affecting user information, we will notify affected servers through Discord announcements or direct messages to server administrators.

## 11. International Users

The Bot is hosted in the United States. By using the Bot, you consent to the transfer and processing of your data in the United States.

## 12. Contact Us

If you have questions or concerns about this Privacy Policy or your data, please contact us:
- GitHub: https://github.com/r3volution11/Egg-Shen-Bot
- Create an issue: https://github.com/r3volution11/Egg-Shen-Bot/issues

## 13. Your Consent

By using Egg Shen Bot, you consent to this Privacy Policy.

---

**This Privacy Policy is effective as of June 15, 2026.**
