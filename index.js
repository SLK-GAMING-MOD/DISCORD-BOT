const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose'); // Thêm thư viện database

// Khởi tạo bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==========================================
// HỆ THỐNG DATABASE (MONGODB)
// ==========================================

// 🛑 THAY MẬT KHẨU CỦA BRO VÀO CHỖ <db_password> 🛑
// Nếu bro dùng Railway Variables thì biến process.env.MONGO_URI sẽ được ưu tiên.
const mongoURI = process.env.MONGO_URI || "mongodb+srv://discordbot:<db_password>@cluster0.qmixkxr.mongodb.net/?appName=Cluster0";

mongoose.connect(mongoURI)
    .then(() => console.log('☁️ Đã kết nối thành công với Database MongoDB!'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// Tạo form lưu Tiền
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    money: { type: Number, default: 0 }
});
const UserMoney = mongoose.model('UserMoney', userSchema);

// Tạo form lưu Lệnh Custom
const commandSchema = new mongoose.Schema({
    cmdName: { type: String, required: true, unique: true },
    response: { type: String, required: true }
});
const CustomCmd = mongoose.model('CustomCmd', commandSchema);

// Biến lưu trữ tạm (Cache) để bot chạy nhanh hơn, không phải gọi DB mỗi tin nhắn
let customCommands = {};

// Hàm tải toàn bộ Lệnh Custom từ Database khi bot vừa bật
async function loadCommands() {
    const cmds = await CustomCmd.find({});
    cmds.forEach(cmd => {
        customCommands[cmd.cmdName] = cmd.response;
    });
    console.log(`✅ Đã tải ${cmds.length} lệnh Custom từ Database!`);
}

// Hàm lấy/tạo dữ liệu tiền người dùng
async function getUserMoney(userId) {
    let user = await UserMoney.findOne({ userId: userId });
    if (!user) {
        user = new UserMoney({ userId: userId, money: 0 });
        await user.save();
    }
    return user;
}

// Hàm định dạng tiền tệ VND
function formatVND(amount) {
    return amount.toLocaleString('vi-VN') + ' VNĐ';
}

// -----------------------------------------------------------

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã online!`);
    await loadCommands(); // Tải lệnh lúc khởi động
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userId = message.author.id;

    // ==========================================
    // CÁC LỆNH VỀ KINH TẾ (ECONOMY)
    // ==========================================

    // 1. Xem tiền (.money hoặc .money @user)
    if (command === '.money') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = await getUserMoney(targetUser.id);
        const balance = targetData.money;

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
        setTimeout(async () => {
            const isWin = (Math.random() * 100) >= risk;
            let resultEmbed = new EmbedBuilder();
            const userData = await getUserMoney(userId); // Lấy data từ DB

            if (isWin) {
                // Thắng
                const minWin = 1000 + (risk * 20000);
                const maxWin = 5000 + (risk * 50000);
                const earned = Math.floor(Math.random() * (maxWin - minWin + 1)) + minWin;

                userData.money += earned;
                await userData.save(); // Lưu vào DB

                resultEmbed.setColor('#2ecc71')
                    .setTitle('🎉 Chúc Mừng!')
                    .setDescription(`Bạn đã mạo hiểm với tỉ lệ rủi ro **${risk}%** và trúng quả đậm!\n\n💸 Nhận được: **+${formatVND(earned)}**\n💰 Số dư hiện tại: **${formatVND(userData.money)}**`);
            } else {
                // Thua
                const minLose = 1000 + (risk * 5000);
                const maxLose = 5000 + (risk * 15000);
                let lost = Math.floor(Math.random() * (maxLose - minLose + 1)) + minLose;

                // Không trừ âm tiền
                if (userData.money < lost) lost = userData.money;
                userData.money -= lost;
                await userData.save(); // Lưu vào DB

                resultEmbed.setColor('#e74c3c')
                    .setTitle('😭 Toang Rồi!')
                    .setDescription(`Mạo hiểm **${risk}%** nhưng nhân phẩm kém, bạn đã bị lừa sạch!\n\n💸 Bị trừ: **-${formatVND(lost)}**\n💰 Số dư hiện tại: **${formatVND(userData.money)}**`);
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

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Số tiền không hợp lệ!');

        const targetData = await getUserMoney(targetUser.id);
        targetData.money += amount;
        await targetData.save();

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

        const senderData = await getUserMoney(userId);
        if (senderData.money < amount) {
            return message.reply(`❌ Bạn không đủ tiền! Số dư của bạn chỉ có: **${formatVND(senderData.money)}**`);
        }

        const targetData = await getUserMoney(targetUser.id);

        // Trừ tiền người gửi, cộng tiền người nhận
        senderData.money -= amount;
        targetData.money += amount;
        
        await senderData.save();
        await targetData.save();

        const transferEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('💸 Chuyển Khoản Thành Công')
            .setDescription(`**${message.author.username}** đã chuyển cho **${targetUser.username}** số tiền:\n\n💵 **${formatVND(amount)}**`);
        return message.reply({ embeds: [transferEmbed] });
    }


    // ==========================================
    // HỆ THỐNG CUSTOM COMMANDS (MONGODB)
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
        
        // Cập nhật Cache
        customCommands[newCmd] = response;
        
        // Lưu lên MongoDB (Tạo mới hoặc Cập nhật nếu đã có)
        await CustomCmd.findOneAndUpdate(
            { cmdName: newCmd }, 
            { response: response }, 
            { upsert: true, new: true }
        );

        const successEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Hệ Thống Lệnh').setDescription(`Đã tạo/cập nhật lệnh **${newCmd}** thành công!`);
        return message.reply({ embeds: [successEmbed] });
    }

    if (command === '.removecommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ Chỉ Admin mới được dùng lệnh này!');
        const targetCmd = args[1]?.toLowerCase();
        
        if (customCommands[targetCmd]) {
            // Xóa khỏi Cache
            delete customCommands[targetCmd];
            // Xóa khỏi Database
            await CustomCmd.findOneAndDelete({ cmdName: targetCmd });
            
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

    // Chạy Lệnh Custom
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
