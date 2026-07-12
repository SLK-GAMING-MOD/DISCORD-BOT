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

// --- HỆ THỐNG LƯU TRỮ DỮ LIỆU (CHỐNG MẤT TRÍ NHỚ) ---
// Thư mục '/data' là nơi Railway Mount Volume. Nếu chạy trên máy tính cá nhân nó sẽ dùng thư mục hiện tại.
const dataFolder = fs.existsSync('/data') ? '/data' : __dirname;
const commandsFilePath = path.join(dataFolder, 'commands.json');
const economyFilePath = path.join(dataFolder, 'economy.json'); // File lưu tiền

let customCommands = {};
let userMoney = {}; // Biến chứa dữ liệu tiền

// Hàm tải dữ liệu
function loadData() {
    // 1. Tải Lệnh Custom
    if (!fs.existsSync(commandsFilePath)) {
        const originalPath = path.join(__dirname, 'commands.json');
        if (fs.existsSync(originalPath)) fs.copyFileSync(originalPath, commandsFilePath);
        else fs.writeFileSync(commandsFilePath, JSON.stringify({}, null, 2));
    }
    customCommands = JSON.parse(fs.readFileSync(commandsFilePath, 'utf8'));

    // 2. Tải Dữ liệu Tiền
    if (!fs.existsSync(economyFilePath)) {
        fs.writeFileSync(economyFilePath, JSON.stringify({}, null, 2));
    }
    userMoney = JSON.parse(fs.readFileSync(economyFilePath, 'utf8'));
}

// Hàm lưu tiền vào file
function saveMoney() {
    fs.writeFileSync(economyFilePath, JSON.stringify(userMoney, null, 2));
}

// Hàm định dạng tiền tệ VND
function formatVND(amount) {
    return amount.toLocaleString('vi-VN') + ' VNĐ';
}

// Khởi chạy tải dữ liệu
loadData();
// -----------------------------------------------------------

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} đã online! Đang dùng thư mục dữ liệu tại: ${dataFolder}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userId = message.author.id;

    // Khởi tạo tài khoản nếu chưa có tiền
    if (userMoney[userId] === undefined) {
        userMoney[userId] = 0;
        saveMoney();
    }

    // ==========================================
    // CÁC LỆNH VỀ KINH TẾ (ECONOMY)
    // ==========================================

    // 1. Xem tiền (.money hoặc .money @user)
    if (command === '.money') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetId = targetUser.id;
        const balance = userMoney[targetId] || 0;

        const moneyEmbed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('💰 Số Dư Tài Khoản')
            .setDescription(`Tài khoản của **${targetUser.username}** hiện có:\n\n💵 **${formatVND(balance)}**`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
        return message.reply({ embeds: [moneyEmbed] });
    }

    // 2. Kiếm tiền (.earnmoney [tỉ lệ mất %])
    if (command === '.earnmoney') {
        let risk = 0; // Mặc định 0%
        if (args[1]) {
            risk = parseInt(args[1].replace('%', ''));
            if (isNaN(risk) || risk < 0) risk = 0;
            if (risk > 99) risk = 99; // Giới hạn max 99%
        }

        // Gửi tin nhắn chờ
        const pendingMsg = await message.reply('⏳ Bot đang đi kiếm tiền cho bạn, chờ 3 giây nhé...');

        // Đợi 3 giây
        setTimeout(() => {
            // Tính toán thắng thua
            const isWin = (Math.random() * 100) >= risk;
            let resultEmbed = new EmbedBuilder();

            if (isWin) {
                // Thắng: Rủi ro càng cao, tiền thưởng gốc càng lớn
                // 0% -> 1k đến 5k. 99% -> Có thể lên hàng trăm triệu.
                const minWin = 1000 + (risk * 20000);
                const maxWin = 5000 + (risk * 50000);
                const earned = Math.floor(Math.random() * (maxWin - minWin + 1)) + minWin;

                userMoney[userId] += earned;
                saveMoney();

                resultEmbed.setColor('#2ecc71')
                    .setTitle('🎉 Chúc Mừng!')
                    .setDescription(`Bạn đã mạo hiểm với tỉ lệ rủi ro **${risk}%** và trúng quả đậm!\n\n💸 Nhận được: **+${formatVND(earned)}**\n💰 Số dư hiện tại: **${formatVND(userMoney[userId])}**`);
            } else {
                // Thua: Mất tiền tỉ lệ thuận với rủi ro
                const minLose = 1000 + (risk * 5000);
                const maxLose = 5000 + (risk * 15000);
                let lost = Math.floor(Math.random() * (maxLose - minLose + 1)) + minLose;

                // Không trừ âm tiền
                if (userMoney[userId] < lost) lost = userMoney[userId];
                userMoney[userId] -= lost;
                saveMoney();

                resultEmbed.setColor('#e74c3c')
                    .setTitle('😭 Toang Rồi!')
                    .setDescription(`Mạo hiểm **${risk}%** nhưng nhân phẩm kém, bạn đã bị lừa sạch!\n\n💸 Bị trừ: **-${formatVND(lost)}**\n💰 Số dư hiện tại: **${formatVND(userMoney[userId])}**`);
            }

            pendingMsg.edit({ content: '', embeds: [resultEmbed] });
        }, 3000);
        return;
    }

    // 3. Admin Bơm Tiền (.addmoney @user 1,000,000)
    if (command === '.addmoney') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Chỉ Admin mới có quyền "in tiền" nha!');
        }

        const targetUser = message.mentions.users.first();
        const amountStr = args[2];

        if (!targetUser || !amountStr) {
            return message.reply('⚠️ Sai cú pháp! Ví dụ: `.addmoney @user 1000000` hoặc `.addmoney @user 1,000,000`');
        }

        // Loại bỏ dấu phẩy/chấm để lấy số chuẩn
        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Số tiền không hợp lệ!');

        const targetId = targetUser.id;
        if (userMoney[targetId] === undefined) userMoney[targetId] = 0;
        
        userMoney[targetId] += amount;
        saveMoney();

        return message.reply(`✅ Đã bơm **${formatVND(amount)}** vào tài khoản của **${targetUser.username}**.`);
    }

    // 4. Chuyển Khoản (.givemoney @user 1,000)
    if (command === '.givemoney') {
        const targetUser = message.mentions.users.first();
        const amountStr = args[2];

        if (!targetUser || !amountStr) {
            return message.reply('⚠️ Sai cú pháp! Ví dụ: `.givemoney @user 50000`');
        }

        if (targetUser.id === message.author.id) {
            return message.reply('⚠️ Không thể tự chuyển tiền cho chính mình!');
        }

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Số tiền chuyển không hợp lệ!');

        if (userMoney[userId] < amount) {
            return message.reply(`❌ Bạn không đủ tiền! Số dư của bạn chỉ có: **${formatVND(userMoney[userId])}**`);
        }

        const targetId = targetUser.id;
        if (userMoney[targetId] === undefined) userMoney[targetId] = 0;

        // Trừ người gửi, cộng người nhận
        userMoney[userId] -= amount;
        userMoney[targetId] += amount;
        saveMoney();

        const transferEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('💸 Chuyển Khoản Thành Công')
            .setDescription(`**${message.author.username}** đã chuyển cho **${targetUser.username}** số tiền:\n\n💵 **${formatVND(amount)}**`);
        return message.reply({ embeds: [transferEmbed] });
    }


    // ==========================================
    // HỆ THỐNG CUSTOM COMMANDS (GIỮ NGUYÊN)
    // ==========================================

    if (command === '.newcommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const errorEmbed = new EmbedBuilder().setColor('#ff3333').setTitle('❌ Thất Bại').setDescription('Chỉ Admin mới được dùng lệnh này nha bro!');
            return message.reply({ embeds: [errorEmbed] });
        }
        if (args.length < 3) {
            const syntaxEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('⚠️ Sai cú pháp').setDescription('Ví dụ chuẩn: `.newcommand .hello Chào cậu`');
            return message.reply({ embeds: [syntaxEmbed] });
        }
        const newCmd = args[1].toLowerCase();
        const response = args.slice(2).join(' '); 
        customCommands[newCmd] = response;
        fs.writeFileSync(commandsFilePath, JSON.stringify(customCommands, null, 2));
        const successEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Hệ Thống Lệnh').setDescription(`Đã tạo lệnh **${newCmd}** thành công!`);
        return message.reply({ embeds: [successEmbed] });
    }

    if (command === '.removecommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ Chỉ Admin mới được dùng lệnh này!');
        const targetCmd = args[1]?.toLowerCase();
        if (customCommands[targetCmd]) {
            delete customCommands[targetCmd];
            fs.writeFileSync(commandsFilePath, JSON.stringify(customCommands, null, 2));
            return message.reply(`✅ Đã xóa lệnh **${targetCmd}** thành công!`);
        } else {
            return message.reply('⚠️ Không tìm thấy lệnh này trong hệ thống.');
        }
    }

    if (command === '.help') {
        const cmds = Object.keys(customCommands);
        let desc = cmds.length === 0 ? 'Hiện tại chưa có lệnh custom nào.' : cmds.map(c => `• \`${c}\``).join('\n');
        
        const helpEmbed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('📜 Danh Sách Lệnh')
            .setDescription(`**Lệnh Tiền Tệ:**\n• \`.money [@user]\` - Xem tiền\n• \`.earnmoney [0-99%]\` - Kiếm tiền\n• \`.givemoney [@user] [số tiền]\` - Chuyển khoản\n• \`.addmoney [@user] [số tiền]\` - (Admin) Bơm tiền\n\n**Lệnh Custom:**\n${desc}`);
        return message.reply({ embeds: [helpEmbed] });
    }

    const userMessage = message.content.toLowerCase();
    if (customCommands[userMessage]) {
        const resultEmbed = new EmbedBuilder()
            .setColor('#2ecc71') 
            .setTitle('__**Hutao Cute V4**__') 
            .addFields({ name: 'Result', value: customCommands[userMessage] }) 
            .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

        const copyButton = new ButtonBuilder()
            .setCustomId(`copy_btn_${userMessage}`)
            .setLabel('Copy')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(copyButton);
        return message.reply({ embeds: [resultEmbed], components: [row] });
    }
});

// Xử lý nút Copy
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('copy_btn_')) {
        const cmdName = interaction.customId.replace('copy_btn_', '');
        const textToCopy = customCommands[cmdName];
        if (textToCopy) {
            await interaction.reply({ content: textToCopy, ephemeral: true });
        } else {
            await interaction.reply({ content: '⚠️ Lệnh này không tồn tại hoặc đã bị xóa.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
