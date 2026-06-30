const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Khởi tạo bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Đường dẫn tới file chứa lệnh
const commandsFilePath = path.join(__dirname, 'commands.json');
let customCommands = {};

// Hàm tải các command
function loadCommands() {
    if (fs.existsSync(commandsFilePath)) {
        const rawData = fs.readFileSync(commandsFilePath, 'utf8');
        customCommands = JSON.parse(rawData);
    }
}

loadCommands();

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} đã online!`);
});

// Sự kiện xử lý khi có tin nhắn
client.on('messageCreate', message => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // 1. Lệnh tạo command mới (Chỉ Admin)
    if (command === '.newcommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff3333')
                .setTitle('❌ Thất Bại')
                .setDescription('Chỉ Admin mới được dùng lệnh này nha bro!');
            return message.reply({ embeds: [errorEmbed] });
        }
        
        if (args.length < 3) {
            const syntaxEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle('⚠️ Sai cú pháp')
                .setDescription('Ví dụ chuẩn: `.newcommand .hello Chào cậu`');
            return message.reply({ embeds: [syntaxEmbed] });
        }

        const newCmd = args[1].toLowerCase();
        const response = args.slice(2).join(' '); 

        customCommands[newCmd] = response;
        fs.writeFileSync(commandsFilePath, JSON.stringify(customCommands, null, 2));

        const successEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Hệ Thống Lệnh')
            .setDescription(`Đã tạo lệnh **${newCmd}** thành công!`);
        return message.reply({ embeds: [successEmbed] });
    }

    // 4. Lệnh xóa command (Chỉ Admin)
    if (command === '.removecommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff3333')
                .setTitle('❌ Thất Bại')
                .setDescription('Chỉ Admin mới được dùng lệnh này!');
            return message.reply({ embeds: [errorEmbed] });
        }

        const targetCmd = args[1]?.toLowerCase();
        if (customCommands[targetCmd]) {
            delete customCommands[targetCmd];
            fs.writeFileSync(commandsFilePath, JSON.stringify(customCommands, null, 2));

            const removeEmbed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Hệ Thống Lệnh')
                .setDescription(`Đã xóa lệnh **${targetCmd}** thành công!`);
            return message.reply({ embeds: [removeEmbed] });
        } else {
            const notFoundEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setDescription('⚠️ Không tìm thấy lệnh này trong hệ thống.');
            return message.reply({ embeds: [notFoundEmbed] });
        }
    }

    // 3. Lệnh Help
    if (command === '.help') {
        const cmds = Object.keys(customCommands);
        if (cmds.length === 0) {
            const noCmdEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setDescription('Hiện tại chưa có lệnh custom nào.');
            return message.reply({ embeds: [noCmdEmbed] });
        }

        const helpEmbed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('📜 Danh Sách Lệnh Hiện Có')
            .setDescription(cmds.map(c => `• \`${c}\``).join('\n'))
            .setFooter({ text: `Tổng số: ${cmds.length} lệnh đang hoạt động` });
        return message.reply({ embeds: [helpEmbed] });
    }

    // 2. Chạy lệnh custom và hiển thị nút Copy
    const userMessage = message.content.toLowerCase();
    if (customCommands[userMessage]) {
        const resultEmbed = new EmbedBuilder()
            .setColor('#2ecc71') 
            .setTitle('Hutao Cute V4') 
            .addFields({ name: 'Result', value: customCommands[userMessage] }) 
            .setFooter({ 
                text: `Requested by ${message.author.username}`, 
                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
            });

        // Tạo nút Copy (Màu xanh lá - Success)
        const copyButton = new ButtonBuilder()
            .setCustomId(`copy_btn_${userMessage}`) // Gắn ID chứa tên lệnh để bot biết copy cái gì
            .setLabel('Copy')
            .setStyle(ButtonStyle.Success);

        // Gắn nút vào 1 hàng (ActionRow)
        const row = new ActionRowBuilder().addComponents(copyButton);
        
        // Gửi Embed kèm Nút bấm
        return message.reply({ embeds: [resultEmbed], components: [row] });
    }
});

// Sự kiện xử lý khi có người bấm vào nút (Interaction)
client.on('interactionCreate', async interaction => {
    // Nếu không phải là click vào nút thì bỏ qua
    if (!interaction.isButton()) return;

    // Kiểm tra xem có đúng là nút Copy của hệ thống mình không
    if (interaction.customId.startsWith('copy_btn_')) {
        // Lấy tên lệnh từ ID của nút
        const cmdName = interaction.customId.replace('copy_btn_', '');
        const textToCopy = customCommands[cmdName];

        if (textToCopy) {
            // Trả lời lại cho người bấm bằng nội dung lệnh dạng ẨN (ephemeral)
            await interaction.reply({ content: textToCopy, ephemeral: true });
        } else {
            // Phòng hờ trường hợp lệnh đã bị xóa nhưng người ta vẫn bấm nút cũ
            await interaction.reply({ content: '⚠️ Lệnh này không tồn tại hoặc đã bị xóa.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
