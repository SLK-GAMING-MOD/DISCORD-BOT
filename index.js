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

// --- PHẦN LƯU TRỮ DỮ LIỆU ---
// Kiểm tra xem có ổ cứng Volume '/data' trên Railway không.
const dataFolder = fs.existsSync('/data') ? '/data' : __dirname;
const commandsFilePath = path.join(dataFolder, 'commands.json');
const moneyFilePath = path.join(dataFolder, 'money.json'); // File lưu tiền tệ mới
let customCommands = {};
let userMoney = {};

// Hàm tải toàn bộ dữ liệu
function loadData() {
    // 1. Tải lệnh custom
    if (!fs.existsSync(commandsFilePath)) {
        const originalPath = path.join(__dirname, 'commands.json');
        if (fs.existsSync(originalPath)) {
            fs.copyFileSync(originalPath, commandsFilePath);
        } else {
            fs.writeFileSync(commandsFilePath, JSON.stringify({}, null, 2));
        }
    }
    customCommands = JSON.parse(fs.readFileSync(commandsFilePath, 'utf8'));

    // 2. Tải dữ liệu tiền tệ
    if (!fs.existsSync(moneyFilePath)) {
        fs.writeFileSync(moneyFilePath, JSON.stringify({}, null, 2));
    }
    userMoney = JSON.parse(fs.readFileSync(moneyFilePath, 'utf8'));
}

// Hàm lưu tiền
function saveMoney() {
    fs.writeFileSync(moneyFilePath, JSON.stringify(userMoney, null, 2));
}

// Chạy hàm tải dữ liệu khi khởi động
loadData();

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} đã online!`);
});

// Set dùng để chống spam lệnh earnmoney
const activeEarners = new Set();

// Sự kiện xử lý khi có tin nhắn (Lưu ý: đã thêm 'async' để dùng await cho lệnh delay 3s)
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // ==========================================
    // HỆ THỐNG KINH TẾ (MONEY SYSTEM)
    // ==========================================

    // Lệnh xem số dư (.money hoặc .money @ai-đó)
    if (command === '.money') {
        const targetUser = message.mentions.users.first() || message.author;
        const balance = userMoney[targetUser.id] || 0;

        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle(`💰 Số Dư Của ${targetUser.username}`)
            .setDescription(`**${balance.toLocaleString('vi-VN')} VND**`);
        return message.reply({ embeds: [embed] });
    }

    // Lệnh kiếm tiền (.earnmoney [tỷ lệ mất tiền])
    if (command === '.earnmoney') {
        if (activeEarners.has(message.author.id)) {
            return message.reply('⏳ Bình tĩnh bro! Đang làm job cũ chưa xong mà.');
        }

        let riskStr = args[1] ? args[1].replace('%', '') : '0';
        let risk = parseInt(riskStr);

        if (isNaN(risk) || risk < 0 || risk > 99) {
            return message.reply('⚠️ Sai cú pháp! Tỷ lệ rủi ro phải là số từ 0 đến 99 (Ví dụ: `.earnmoney 66%` hoặc chỉ gõ `.earnmoney`).');
        }

        activeEarners.add(message.author.id);

        const workingEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setDescription('⏳ Đang bắt đầu kiếm tiền... Xin chờ 3 giây!');
        
        const replyMsg = await message.reply({ embeds: [workingEmbed] });

        // Delay 3 giây
        setTimeout(() => {
            activeEarners.delete(message.author.id);
            const roll = Math.random() * 100; // Quay random từ 0 đến 100
            
            if (roll < risk) {
                // Rớt vô ô mất tiền (Thất bại)
                const penalty = Math.floor(Math.random() * 20000) + 1000; // Bị trừ random 1k - 21k
                userMoney[message.author.id] = (userMoney[message.author.id] || 0) - penalty;
                if (userMoney[message.author.id] < 0) userMoney[message.author.id] = 0; // Không cho âm tiền
                saveMoney();

                const failEmbed = new EmbedBuilder()
                    .setColor('#ff3333')
                    .setTitle('💥 Gãy!')
                    .setDescription(`Bạn đánh cược với tỷ lệ rủi ro **${risk}%** và đã thất bại.\nBạn bị trừ **${penalty.toLocaleString('vi-VN')} VND** phí trị thương!`)
                    .setFooter({ text: `Số dư hiện tại: ${userMoney[message.author.id].toLocaleString('vi-VN')} VND` });
                replyMsg.edit({ embeds: [failEmbed] });
            } else {
                // Trúng quả (Thành công)
                let minWin, maxWin;
                if (risk === 0) {
                    minWin = 1000;
                    maxWin = 5000;
                } else {
                    // Thuật toán: Rủi ro càng cao (gần 99), phần thưởng càng chạm nóc 1 Tỷ
                    const scale = Math.pow(risk / 99, 3); 
                    minWin = 1000 + scale * 99999000; // Đạt ~100 triệu VND max
                    maxWin = 5000 + scale * 999995000; // Đạt ~1 Tỷ VND max
                }

                const reward = Math.floor(Math.random() * (maxWin - minWin + 1)) + minWin;
                userMoney[message.author.id] = (userMoney[message.author.id] || 0) + reward;
                saveMoney();

                const successEmbed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('🎉 Trúng Mánh!')
                    .setDescription(`Khét đấy! Bạn vượt qua rủi ro **${risk}%** và húp trọn **${reward.toLocaleString('vi-VN')} VND**!`)
                    .setFooter({ text: `Số dư hiện tại: ${userMoney[message.author.id].toLocaleString('vi-VN')} VND` });
                replyMsg.edit({ embeds: [successEmbed] });
            }
        }, 3000);
        return;
    }

    // ==========================================
    // HỆ THỐNG LỆNH CUSTOM (Giữ nguyên)
    // ==========================================

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
            .setTitle('__**Hutao Cute V4**__') 
            .addFields({ name: 'Result', value: customCommands[userMessage] }) 
            .setFooter({ 
                text: `Requested by ${message.author.username}`, 
                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
            });

        // Tạo nút Copy (Màu xanh lá - Success)
        const copyButton = new ButtonBuilder()
            .setCustomId(`copy_btn_${userMessage}`) 
            .setLabel('Copy')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(copyButton);
        
        return message.reply({ embeds: [resultEmbed], components: [row] });
    }
});

// Sự kiện xử lý khi có người bấm vào nút (Interaction)
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
