require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('sqlite3').Database;
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites
    ]
});

const db = new Database('invites.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS user_invites (
        user_id TEXT PRIMARY KEY,
        guild_id TEXT,
        total_invites INTEGER DEFAULT 0,
        generated_code TEXT,
        has_role BOOLEAN DEFAULT 0
    )`);
});

const inviteCache = new Map();

client.once('ready', async () => {
    console.log(`${client.user.tag} ready!`);
    
    client.guilds.cache.forEach(async guild => {
        const invites = await guild.invites.fetch();
        inviteCache.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses])));
    });

    const commands = [
        new SlashCommandBuilder()
            .setName('invite-tracker')
            .setDescription('Start the invite tracking system')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands loaded!');
    } catch (error) {
        console.error('Error loading commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        if (interaction.commandName === 'invite-tracker') {
            await handleInviteTracker(interaction);
        }
    }
    
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'invite_menu') {
            await handleMenuSelection(interaction);
        }
    }
});

async function handleInviteTracker(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🔗 **Reach 5 INVITES for FREE ACCESS**')
        .setDescription(
            '📋 **How to use**\n' +
            'Use the dropdown menu below to:\n' +
            '🔷 Generate Invite Link\n' +
            '🔷 View Statistics'
        )
        .setFooter({ text: '🟥 INVITE TRACKER • 01/08/2025, 17:06' })
        .setColor('#FF0000');

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('invite_menu')
        .setPlaceholder('*Select an option* ⏵')
        .addOptions([
            {
                label: '🔗 Generate Invite Link',
                description: 'Generate personal invite link',
                value: 'generate_invite'
            },
            {
                label: '📊 View Statistics',
                description: 'View invite statistics',
                value: 'view_stats'
            },
            {
                label: '✅ Check & Claim Role',
                description: 'Check invite count and claim role',
                value: 'check_role'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
}

async function handleMenuSelection(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    switch (interaction.values[0]) {
        case 'generate_invite':
            await generateInviteLink(interaction, userId, guildId);
            break;
        case 'view_stats':
            await viewStatistics(interaction, userId, guildId);
            break;
        case 'check_role':
            await checkAndGiveRole(interaction, userId, guildId);
            break;
    }
}

async function generateInviteLink(interaction, userId, guildId) {
    try {
        const channel = interaction.guild.systemChannel || interaction.channel;
        const invite = await channel.createInvite({
            maxAge: 0,
            maxUses: 0,
            unique: true,
            reason: `Personal invite link for ${interaction.user.tag}`
        });

        db.run(
            'INSERT OR REPLACE INTO user_invites (user_id, guild_id, generated_code, total_invites, has_role) VALUES (?, ?, ?, COALESCE((SELECT total_invites FROM user_invites WHERE user_id = ?), 0), COALESCE((SELECT has_role FROM user_invites WHERE user_id = ?), 0))',
            [userId, guildId, invite.code, userId, userId]
        );

        const embed = new EmbedBuilder()
            .setTitle('🔗 Invite Link Created!')
            .setDescription(`Your personal invite link: https://discord.gg/${invite.code}`)
            .setColor('#00FF00')
            .setFooter({ text: 'This link was specially created for you' });

        await interaction.update({
            embeds: [embed],
            components: []
        });
    } catch (error) {
        console.error('Invite creation error:', error);
        await interaction.update({
            content: '❌ An error occurred while creating invite link!',
            embeds: [],
            components: []
        });
    }
}

async function viewStatistics(interaction, userId, guildId) {
    db.get(
        'SELECT * FROM user_invites WHERE user_id = ? AND guild_id = ?',
        [userId, guildId],
        (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return;
            }

            const totalInvites = row ? row.total_invites : 0;
            const hasRole = row ? row.has_role : false;
            const remaining = Math.max(0, 5 - totalInvites);

            const embed = new EmbedBuilder()
                .setTitle('📊 Your Invite Statistics')
                .addFields(
                    { name: '🎯 Total Invites', value: `${totalInvites}`, inline: true },
                    { name: '⏳ Remaining Invites', value: `${remaining}`, inline: true },
                    { name: '🎖️ Role Status', value: hasRole ? '✅ Claimed' : '❌ Not Claimed', inline: true }
                )
                .setColor(totalInvites >= 5 ? '#00FF00' : '#FFA500')
                .setFooter({ text: 'You can claim your special role when you reach 5 invites!' });

            interaction.update({
                embeds: [embed],
                components: []
            });
        }
    );
}

async function checkAndGiveRole(interaction, userId, guildId) {
    db.get(
        'SELECT * FROM user_invites WHERE user_id = ? AND guild_id = ?',
        [userId, guildId],
        async (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return;
            }

            const totalInvites = row ? row.total_invites : 0;
            const hasRole = row ? row.has_role : false;

            if (hasRole) {
                const embed = new EmbedBuilder()
                    .setTitle('ℹ️ Role Already Claimed!')
                    .setDescription('You have already claimed this role.')
                    .setColor('#FFA500');

                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                return;
            }

            if (totalInvites >= 5) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    const roleId = process.env.ROLE_ID;
                    let role = null;
                    
                    if (roleId) {
                        role = interaction.guild.roles.cache.get(roleId);
                    }
                    
                    if (!role) {
                        role = await interaction.guild.roles.create({
                            name: 'VIP Member',
                            color: '#FFD700',
                            permissions: [],
                            reason: 'Invite tracker special role'
                        });
                        console.log(`New role created! ID: ${role.id} - Add this ID to .env file`);
                    }

                    await member.roles.add(role);

                    db.run(
                        'UPDATE user_invites SET has_role = 1, total_invites = total_invites - 5 WHERE user_id = ? AND guild_id = ?',
                        [userId, guildId]
                    );

                    const embed = new EmbedBuilder()
                        .setTitle('🎉 Congratulations!')
                        .setDescription(`You successfully claimed the ${role} role!\n5 invites have been used.`)
                        .setColor('#00FF00')
                        .setFooter({ text: 'You can now use your role!' });

                    await interaction.update({
                        embeds: [embed],
                        components: []
                    });
                } catch (error) {
                    console.error('Role assignment error:', error);
                    await interaction.update({
                        content: '❌ An error occurred while assigning role!',
                        embeds: [],
                        components: []
                    });
                }
            } else {
                const remaining = 5 - totalInvites;
                const embed = new EmbedBuilder()
                    .setTitle('❌ Insufficient Invites!')
                    .setDescription(`You need ${remaining} more invites to claim the role.`)
                    .setColor('#FF0000')
                    .addFields(
                        { name: '🎯 Current Invites', value: `${totalInvites}`, inline: true },
                        { name: '⏳ Remaining Invites', value: `${remaining}`, inline: true }
                    );

                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            }
        }
    );
}

client.on('inviteCreate', async invite => {
    const guildInvites = inviteCache.get(invite.guild.id);
    guildInvites.set(invite.code, invite.uses);
});

client.on('guildMemberAdd', async member => {
    const guild = member.guild;
    const cachedInvites = inviteCache.get(guild.id);
    const newInvites = await guild.invites.fetch();

    const usedInvite = newInvites.find(invite => {
        const cachedInvite = cachedInvites.get(invite.code);
        return cachedInvite !== undefined && invite.uses > cachedInvite;
    });

    if (usedInvite) {
        db.get(
            'SELECT user_id FROM user_invites WHERE generated_code = ? AND guild_id = ?',
            [usedInvite.code, guild.id],
            (err, row) => {
                if (!err && row) {
                    db.run(
                        'UPDATE user_invites SET total_invites = total_invites + 1 WHERE user_id = ? AND guild_id = ?',
                        [row.user_id, guild.id]
                    );
                    console.log(`Invite count increased for user ${row.user_id}`);
                }
            }
        );
    }

    inviteCache.set(guild.id, new Map(newInvites.map(invite => [invite.code, invite.uses])));
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(process.env.BOT_TOKEN);