# Discord Invite Tracker Bot

This bot tracks invites on Discord servers and rewards users with roles.

## Features

- ✅ Generate unique invite links per user
- ✅ Track invite counts
- ✅ Automatic role assignment for users reaching 5 invites
- ✅ Statistics display
- ✅ SQLite database integration

## Installation

1. Install required packages:
```bash
npm install
```

2. Add your bot token to `.env` file:
```
BOT_TOKEN=your_bot_token_here
```

3. Start the bot:
```bash
npm start
```

## Bot Permissions

Required permissions for the bot:
- Read Messages/View Channels
- Send Messages
- Use Slash Commands
- Create Instant Invite
- Manage Roles
- Read Message History

## Usage

1. Use `/invite-tracker` command to start the system
2. Use options from the dropdown menu:
   - **Generate Invite Link**: Create personal invite link
   - **View Statistics**: Display invite statistics
   - **Check & Claim Role**: Claim your role if you reached 5 invites

## System Logic

- Each user can create their own personal invite link
- When someone joins the server using this link, invite count increases
- Users reaching 5 invites can claim the "VIP Member" role
- After claiming the role, 5 invites are consumed (total_invites - 5)