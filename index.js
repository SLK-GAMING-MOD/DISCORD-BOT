const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Khởi tạo bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers 
    ]
});

// ==========================================
// HỆ THỐNG DATABASE (MONGODB)
// ==========================================

const mongoURI = process.env.MONGO_URI || "mongodb+srv://discordbot:<db_password>@cluster0.qmixkxr.mongodb.net/?appName=Cluster0";

mongoose.connect(mongoURI)
    .then(() => console.log('☁️ Đã kết nối thành công với Database MongoDB!'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// 1. Bảng dữ liệu User (Đã thêm level Balo & Đếm số lần dùng thuốc)
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    money: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    lastInterestUpdate: { type: Date, default: Date.now },
    luck1: { type: Number, default: 0 }, 
    luck2: { type: Number, default: 0 }, 
    luck3: { type: Number, default: 0 }, 
    luckBuff: { type: Number, default: 0 }, 
    luckExpiry: { type: Date, default: null },
    stealCooldown: { type: Date, default: null },
    backpackLevel: { type: Number, default: 0 }, // Cấp độ Balo (Mặc định 0 = 5 món/loại)
    usedLuck1: { type: Number, default: 0 },     // Số lần đã dùng Lọ I trong đợt buff
    usedLuck2: { type: Number, default: 0 },     // Số lần đã dùng Lọ II trong đợt buff
    usedLuck3: { type: Number, default: 0 }      // Số lần đã dùng Lọ III trong đợt buff
});
const UserMoney = mongoose.model('UserMoney', userSchema);

const commandSchema = new mongoose.Schema({
    cmdName: { type: String, required: true, unique: true },
    response: { type: String, required: true }
});
const CustomCmd = mongoose.model('CustomCmd', commandSchema);

const shopSchema = new mongoose.Schema({
    shopId: { type: String, default: "global" },
    stock1: { type: Number, default: 0 },
    stock2: { type: Number, default: 0 },
    stock3: { type: Number, default: 0 },
    lastRestock: { type: Date, default: Date.now }
});
const Shop = mongoose.model('Shop', shopSchema);

const guildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prisonChannelId: { type: String, default: null },
    prisonerRoleId: { type: String, default: null }
});
const GuildConfig = mongoose.model('GuildConfig', guildConfigSchema);

const prisonerSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    tasksRemaining: { type: Number, default: 0 },
    originalRoles: { type: Array, default: [] }, 
    reason: { type: String, default: "Không có" }
});
const Prisoner = mongoose.model('Prisoner', prisonerSchema);

let customCommands = {};

// ==========================================
// CÁC HÀM HỖ TRỢ
// ==========================================

function replyEmbed(message, color, description, title = null) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description);
    if (title) embed.setTitle(title);
    return message.reply({ embeds: [embed] });
}

async function loadCommands() {
    try {
        const commandsFilePath = path.join(__dirname, 'commands.json');
        if (fs.existsSync(commandsFilePath)) {
            const rawData = fs.readFileSync(commandsFilePath, 'utf8');
            const oldCommands = JSON.parse(rawData);

            for (const [cmdName, response] of Object.entries(oldCommands)) {
                const exists = await CustomCmd.findOne({ cmdName: cmdName });
                if (!exists) {
                    await CustomCmd.create({ cmdName: cmdName, response: response });
                }
            }
        }
    } catch (err) {
        console.error("⚠️ Lỗi khi đồng bộ file commands.json:", err);
    }

    const cmds = await CustomCmd.find({});
    cmds.forEach(cmd => {
        customCommands[cmd.cmdName] = cmd.response;
    });
    console.log(`✅ Đã tải ${cmds.length} lệnh Custom từ Database!`);
}

async function getUserMoney(userId) {
    let user = await UserMoney.findOne({ userId: userId });
    if (!user) {
        user = new UserMoney({ userId: userId, money: 0, bank: 0 });
        await user.save();
    }
    return user;
}

// ---------------------------------------------------------
// ĐÃ FIX: CHUẨN HOÁ RESTOCK THEO THỜI GIAN THỰC (00 & 30) & HẾT HÀNG
// ---------------------------------------------------------
async function checkAndRestock() {
    let shop = await Shop.findOne({ shopId: "global" });
    const now = Date.now();
    const thirtyMins = 30 * 60 * 1000;
    
    // Tính toán chu kỳ 30 phút gần nhất của thế giới (00 hoặc 30)
    const currentPeriod = Math.floor(now / thirtyMins) * thirtyMins; 
    
    if (!shop) {
        shop = new Shop({
            shopId: "global",
            stock1: Math.floor(Math.random() * 5) + 1, // Random từ 1 đến 5
            stock2: Math.floor(Math.random() * 5) + 1,
            stock3: Math.floor(Math.random() * 5) + 1,
            lastRestock: new Date(currentPeriod)
        });
        await shop.save();
        return shop;
    }

    // Nếu thời gian hiện tại đã bước sang chu kỳ mới (lớn hơn hoặc bằng mốc restock cũ + 30 phút)
    if (now >= shop.lastRestock.getTime() + thirtyMins) {
        shop.stock1 = Math.floor(Math.random() * 5) + 1; // Nhập hàng mới từ 1 đến 5
        shop.stock2 = Math.floor(Math.random() * 5) + 1;
        shop.stock3 = Math.floor(Math.random() * 5) + 1;
        shop.lastRestock = new Date(currentPeriod); // Cập nhật mốc thời gian chuẩn
        await shop.save();
    }
    
    return shop;
}

async function applyInterest(userData) {
    if (userData.bank > 0) {
        const now = Date.now();
        const diffMs = now - userData.lastInterestUpdate.getTime();
        const intervalMs = 24 * 60 * 60 * 1000; 
        const intervals = Math.floor(diffMs / intervalMs);
        
        if (intervals > 0) {
            userData.bank = Math.floor(userData.bank * Math.pow(1.05, intervals));
            const remainder = diffMs % intervalMs; 
            userData.lastInterestUpdate = new Date(now - remainder);
            await userData.save();
        }
    } else {
        userData.lastInterestUpdate = new Date(); 
    }
}

function formatVND(amount) {
    return amount.toLocaleString('vi-VN') + ' VNĐ';
}

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã online!`);
    await loadCommands();
});

// ==========================================
// HỆ THỐNG CHỐNG VƯỢT NGỤC (ANTI-ESCAPE)
// ==========================================
client.on('guildMemberAdd', async member => {
    const isPrisoner = await Prisoner.findOne({ userId: member.id, guildId: member.guild.id });
    if (isPrisoner) {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config && config.prisonerRoleId) {
            try {
                await member.roles.set([config.prisonerRoleId]);
                const jailChannel = member.guild.channels.cache.get(config.prisonChannelId);
                if (jailChannel) {
                    jailChannel.send({ embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription(`🚨 **CẢNH BÁO:** Tên tội phạm <@${member.id}> vừa định vượt ngục bằng cách rời server nhưng đã bị tóm cổ lại! Số nhiệm vụ còn lại: **${isPrisoner.tasksRemaining}**`)] });
                }
            } catch (err) {
                console.error("Lỗi khi gắn lại role tù nhân:", err);
            }
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userId = message.author.id;

    // ==========================================
    // HỆ THỐNG NHÀ TÙ (PRISON SYSTEM)
    // ==========================================

    if (command === '.setupprison') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới có quyền thiết lập nhà tù!');

        const channelMention = message.mentions.channels.first();
        const roleMention = message.mentions.roles.first();

        if (!channelMention || !roleMention) {
            return replyEmbed(message, '#e67e22', '⚠️ Cú pháp sai! Dùng: `.setupprison #tên_kênh_tù @tên_role_tù_nhân`\n*Lưu ý: Hãy setup thủ công quyền của Role tù nhân trong Channel sao cho họ chỉ thấy được kênh tù, các kênh khác chặn View Channel.*');
        }

        await GuildConfig.findOneAndUpdate(
            { guildId: message.guild.id },
            { prisonChannelId: channelMention.id, prisonerRoleId: roleMention.id },
            { upsert: true, new: true }
        );

        return replyEmbed(message, '#2ecc71', `✅ Cài đặt nhà tù thành công!\nKênh nhà tù: ${channelMention}\nRole tù nhân: ${roleMention}`);
    }

    if (command === '.vaotu' || command === '.jail') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Bạn không phải là Cảnh Sát Trưởng (Cần quyền Admin)!');

        const config = await GuildConfig.findOne({ guildId: message.guild.id });
        if (!config || !config.prisonChannelId || !config.prisonerRoleId) {
            return replyEmbed(message, '#e67e22', '⚠️ Hệ thống nhà tù chưa được thiết lập. Hãy dùng lệnh `.setupprison` trước!');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) return replyEmbed(message, '#e67e22', '⚠️ Dùng: `.vaotu @người_dùng <số_lần_phạt> [lý do]`');
        if (targetMember.id === message.author.id) return replyEmbed(message, '#e67e22', '⚠️ Đừng tự nhốt mình chứ?');

        const tasksCount = parseInt(args[2]);
        if (isNaN(tasksCount) || tasksCount <= 0) return replyEmbed(message, '#e67e22', '⚠️ Số lần phạt phải là một con số hợp lệ!');

        const reason = args.slice(3).join(' ') || "Vi phạm luật server";

        let isJailed = await Prisoner.findOne({ userId: targetMember.id, guildId: message.guild.id });
        if (isJailed) return replyEmbed(message, '#e67e22', '⚠️ Tên tội phạm này đã ở trong tù rồi!');

        const currentRoles = targetMember.roles.cache.filter(role => role.name !== '@everyone').map(role => role.id);

        try {
            await targetMember.roles.set([config.prisonerRoleId]);
            await Prisoner.create({ userId: targetMember.id, guildId: message.guild.id, tasksRemaining: tasksCount, originalRoles: currentRoles, reason: reason });

            const jailChannel = message.guild.channels.cache.get(config.prisonChannelId);
            if (jailChannel) {
                jailChannel.send({ embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription(`🚨 <@${targetMember.id}> đã bị áp giải vào tù!\n📝 **Lý do:** ${reason}\n🧹 **Hình phạt:** Để được thả, hãy \`.cleanup\` đủ **${tasksCount} lần** tại đây.`)] });
            }

            return replyEmbed(message, '#2ecc71', `✅ Đã tống cổ **${targetMember.user.username}** vào tù với mức án: ${tasksCount} lần dọn dẹp.`);
        } catch (err) {
            return replyEmbed(message, '#e74c3c', '❌ Không thể bỏ tù người này! Hãy kiểm tra xem Role của bot có nằm CAO HƠN Role của người bị phạt và Role Tù nhân không nhé.');
        }
    }

    if (command === '.cleanup' || command === '.clean') {
        const config = await GuildConfig.findOne({ guildId: message.guild.id });
        if (!config || message.channel.id !== config.prisonChannelId) return; 

        let prisoner = await Prisoner.findOne({ userId: userId, guildId: message.guild.id });
        if (!prisoner) return replyEmbed(message, '#e67e22', 'Bạn đâu có ở tù mà đòi dọn dẹp?');

        prisoner.tasksRemaining -= 1;

        if (prisoner.tasksRemaining <= 0) {
            const member = message.guild.members.cache.get(userId);
            if (member) {
                try {
                    await member.roles.set(prisoner.originalRoles); 
                    await Prisoner.findOneAndDelete({ userId: userId, guildId: message.guild.id }); 
                    return replyEmbed(message, '#2ecc71', `🎉 Chúc mừng <@${userId}> đã cải tạo tốt, hoàn thành hình phạt và được ân xá về với cộng đồng!`);
                } catch (err) {
                    return replyEmbed(message, '#e74c3c', '❌ Bị lỗi khi thả tự do, vui lòng gọi Admin cứu!');
                }
            }
        } else {
            await prisoner.save();
            return replyEmbed(message, '#3498db', `🧹 <@${userId}> đang tích cực dọn dẹp nhà vệ sinh... Còn lại: **${prisoner.tasksRemaining} lần**.`);
        }
    }

    if (command === '.ratu' || command === '.unjail') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới có quyền đặc xá!');

        const targetMember = message.mentions.members.first();
        if (!targetMember) return replyEmbed(message, '#e67e22', '⚠️ Dùng: `.ratu @người_dùng`');

        let prisoner = await Prisoner.findOne({ userId: targetMember.id, guildId: message.guild.id });
        if (!prisoner) return replyEmbed(message, '#e67e22', '⚠️ Người này không có trong tù!');

        try {
            await targetMember.roles.set(prisoner.originalRoles); 
            await Prisoner.findOneAndDelete({ userId: targetMember.id, guildId: message.guild.id }); 
            return replyEmbed(message, '#2ecc71', `✅ Đã ân xá đặc biệt cho **${targetMember.user.username}**. Họ đã được trả lại tự do và các chức vụ cũ.`);
        } catch (err) {
            return replyEmbed(message, '#e74c3c', '❌ Có lỗi xảy ra khi trả lại role. Hãy đảm bảo Role bot cao hơn các Role cũ của người này.');
        }
    }

    // ==========================================
    // CÁC LỆNH VỀ KINH TẾ (ECONOMY) VÀ LỆNH GỐC
    // ==========================================
    
    if (command === '.money') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = await getUserMoney(targetUser.id);
        
        await applyInterest(targetData); 

        let desc = `Số dư của **${targetUser.username}**:\n\n💵 **Tiền mặt:** ${formatVND(targetData.money)}\n🏦 **Ngân hàng:** ${formatVND(targetData.bank)}`;
        if (targetData.money < 0) {
            desc += `\n\n⚠️ *Cảnh báo: Bạn đang bị nợ xấu (âm tiền mặt)!*`;
        }

        const moneyEmbed = new EmbedBuilder()
            .setColor(targetData.money >= 0 ? '#f1c40f' : '#e74c3c')
            .setTitle('💰 Tài Khoản')
            .setDescription(desc)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
        return message.reply({ embeds: [moneyEmbed] });
    }

    if (command === '.deposit') {
        const amountStr = args[1];
        if (!amountStr) return replyEmbed(message, '#e67e22', "⚠️ Sai cú pháp! Dùng: `.deposit <số tiền>` hoặc `.deposit all`");
        
        const userData = await getUserMoney(userId);
        if (userData.money <= 0) return replyEmbed(message, '#e74c3c', "❌ Bạn đang nợ nần hoặc sạch túi, lấy gì mà gửi ngân hàng?");
        
        await applyInterest(userData); 
        
        let amount = amountStr.toLowerCase() === 'all' ? userData.money : parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > userData.money) return replyEmbed(message, '#e67e22', "⚠️ Số tiền gửi không hợp lệ hoặc lớn hơn tiền mặt bạn đang có!");
        
        userData.money -= amount;
        userData.bank += amount;
        await userData.save();
        return replyEmbed(message, '#2ecc71', `🏦 Giao dịch thành công!\nBạn đã gửi **${formatVND(amount)}** vào ngân hàng. Lãi suất: **+5% mỗi 24 giờ**.`);
    }

    if (command === '.withdraw') {
        const amountStr = args[1];
        if (!amountStr) return replyEmbed(message, '#e67e22', "⚠️ Sai cú pháp! Dùng: `.withdraw <số tiền>` hoặc `.withdraw all`");
        
        const userData = await getUserMoney(userId);
        await applyInterest(userData);
        
        let amount = amountStr.toLowerCase() === 'all' ? userData.bank : parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > userData.bank) return replyEmbed(message, '#e67e22', "⚠️ Số dư trong ngân hàng của bạn không đủ hoặc lệnh rút không hợp lệ!");
        
        userData.bank -= amount;
        userData.money += amount;
        await userData.save();
        return replyEmbed(message, '#2ecc71', `🏦 Giao dịch thành công!\nBạn đã rút **${formatVND(amount)}** từ két ngân hàng ra ví tiền mặt.`);
    }

    if (command === '.doubleornothing' || command === '.don') {
        const amountStr = args[1];
        if (!amountStr) return replyEmbed(message, '#e67e22', '⚠️ Dùng: `.don <số tiền>` hoặc `.don all`');

        const userData = await getUserMoney(userId);
        if (userData.money <= 0) return replyEmbed(message, '#e74c3c', '❌ Bạn không có tiền để chơi!');

        let amount = amountStr.toLowerCase() === 'all' ? userData.money : parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > userData.money) return replyEmbed(message, '#e67e22', '⚠️ Số tiền cược không hợp lệ hoặc lớn hơn tiền bạn có!');

        const isWin = Math.random() < 0.5;
        let embed = new EmbedBuilder();

        if (isWin) {
            userData.money += amount;
            embed.setColor('#2ecc71')
                 .setTitle('🎉 GẤP ĐÔI HAY MẤT TRẮNG - THẮNG!')
                 .setDescription(`Tuyệt vời! Bạn đã nhân đôi số tiền cược.\n\n💸 Tiền nhận: **+${formatVND(amount)}**\n💰 Tiền mặt hiện tại: **${formatVND(userData.money)}**`);
        } else {
            userData.money -= amount;
            embed.setColor('#e74c3c')
                 .setTitle('😭 GẤP ĐÔI HAY MẤT TRẮNG - THUA!')
                 .setDescription(`Đen thôi đỏ quên đi! Bạn đã mất trắng số tiền cược.\n\n💸 Tiền mất: **-${formatVND(amount)}**\n💰 Tiền mặt hiện tại: **${formatVND(userData.money)}**`);
        }
        await userData.save();
        return message.reply({ embeds: [embed] });
    }

    if (command === '.steal') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) return replyEmbed(message, '#e67e22', "⚠️ Bạn phải tag người muốn trộm! Ví dụ: `.steal @ai_đó`");
        if (targetUser.id === userId) return replyEmbed(message, '#e67e22', "⚠️ Sao lại tự móc túi bản thân vậy bro?");

        const attacker = await getUserMoney(userId);

        if (attacker.stealCooldown && attacker.stealCooldown > Date.now()) {
            const timeLeft = Math.ceil((attacker.stealCooldown.getTime() - Date.now()) / 60000);
            return replyEmbed(message, '#e74c3c', `⏳ Bạn đang bị tạm giam vì tội ăn trộm thất bại! Vui lòng chờ **${timeLeft} phút** nữa để ra tù và hành nghề tiếp.`);
        }

        const target = await getUserMoney(targetUser.id);
        const isSuccess = Math.random() < 0.015;

        if (isSuccess) {
            if (target.money <= 0) {
                return replyEmbed(message, '#f1c40f', `🕵️ Trộm thành công! Nhưng bạn phát hiện ra **${targetUser.username}** cũng đang cháy túi/nợ nần, chả có đồng nào để lấy!`);
            }
            const stolenAmount = target.money;
            attacker.money += stolenAmount;
            target.money = 0; 
            
            await attacker.save();
            await target.save();
            return replyEmbed(message, '#2ecc71', `🎉 **ĐỈNH CAO ĐẠO CHÍCH!**\nBạn đã luồn lách và vét sạch ví của **${targetUser.username}**.\n💵 Chiếm đoạt: **${formatVND(stolenAmount)}**`);
        } else {
            await applyInterest(attacker); 

            if (attacker.money > 0) {
                const penalty = Math.floor(attacker.money / 2); 
                attacker.money -= penalty;
                await attacker.save();
                return replyEmbed(message, '#e74c3c', `🚨 **BỊ BẮT QUẢ TANG!**\nBạn ăn trộm thất bại và bị cảnh sát tóm cổ.\n💸 Hình phạt: **-${formatVND(penalty)}** (Trừ 50% tiền mặt).`);
            } else if (attacker.bank > 0) {
                const penalty = Math.floor(attacker.bank / 2); 
                attacker.bank -= penalty;
                await attacker.save();
                return replyEmbed(message, '#e74c3c', `🚨 **BỊ BẮT QUẢ TANG!**\nBạn ăn trộm thất bại! Tiền mặt không có xu nào nên cảnh sát đã trích thu từ tài khoản ngân hàng.\n💸 Hình phạt: **-${formatVND(penalty)}** (Trừ 50% tiền ngân hàng).`);
            } else {
                attacker.stealCooldown = new Date(Date.now() + 60 * 60 * 1000); 
                await attacker.save();
                return replyEmbed(message, '#e74c3c', `🚨 **BỊ BẮT QUẢ TANG!**\nBạn ăn trộm thất bại! Vì cả ví tiền mặt lẫn tài khoản ngân hàng của bạn đều trống rỗng (hoặc âm), cảnh sát đã tống bạn vào đồn.\n⏰ **Hình phạt:** Tạm giam không thể dùng lệnh steal trong **1 giờ**!`);
            }
        }
    }

    // ---------------------------------------------------------
    // ĐÃ FIX: HỆ THỐNG HIỂN THỊ THỜI GIAN NHẬP HÀNG LIVE BẰNG TÍNH NĂNG DISCORD
    // ---------------------------------------------------------
    if (command === '.luckyshop') {
        const shopData = await checkAndRestock();
        const getStockText = (stock) => stock > 0 ? `*(Còn lại: **${stock}** bình)*` : `*(**Hết hàng!**)*`;

        // Cộng 30 phút tính từ chu kỳ gần nhất
        const nextRestock = shopData.lastRestock.getTime() + 30 * 60 * 1000;
        // Chuyển sang chuẩn giây (Unix Epoch) để tích hợp vào Discord Time Format
        const nextRestockUnix = Math.floor(nextRestock / 1000);

        const shopEmbed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('🛒 Cửa Hàng May Mắn')
            .setDescription(`Tăng tỷ lệ thắng khi gõ lệnh \`.earnmoney\`! Buff tác dụng trong **5 phút**.\n⏳ *Đợt nhập hàng tiếp theo lúc:* <t:${nextRestockUnix}:t> (<t:${nextRestockUnix}:R>)\n\n` +
                `🧪 **1. Lucky Point [I]** - \`500,000 VNĐ\` (+3% win)\n   ↳ ${getStockText(shopData.stock1)}\n` +
                `🧪 **2. Lucky Point [II]** - \`750,000 VNĐ\` (+6% win)\n   ↳ ${getStockText(shopData.stock2)}\n` +
                `🧪 **3. Lucky Point [III]** - \`1,750,000 VNĐ\` (+12% win)\n   ↳ ${getStockText(shopData.stock3)}\n\n` +
                '🔹 **Mua:** `.buy <1/2/3>` | 🔹 **Túi:** `.backpack` | 🔹 **Dùng:** `.usepoint <1/2/3>`')
            .setFooter({ text: 'Thương nhân: Hàng hóa làm mới tự động vào đúng phút thứ 00 và 30 mỗi giờ ngoài đời thật!' });
        return message.reply({ embeds: [shopEmbed] });
    }

    // ==========================================
    // LỆNH NÂNG CẤP BALO (MỚI)
    // ==========================================
    if (command === '.upgradebackpack' || command === '.ubp') {
        const userData = await getUserMoney(userId);
        if (userData.money < 0) return replyEmbed(message, '#e74c3c', '❌ Cửa hàng không nhận tiền âm. Hãy đi cày trả nợ trước đi!');

        const currentLevel = userData.backpackLevel || 0;
        const upgradeCost = 100000 * Math.pow(5, currentLevel); // 100k -> 500k -> 2.500k -> ...
        const currentCap = 5 + currentLevel * 5;
        const nextCap = currentCap + 5;

        if (userData.money < upgradeCost) {
            return replyEmbed(message, '#e74c3c', `❌ Bạn không đủ tiền nâng cấp balo!\n\n🎒 Level hiện tại: **Level ${currentLevel}** (Tối đa ${currentCap} món/loại)\n💵 Phí nâng cấp lên **Level ${currentLevel + 1}** (Tối đa ${nextCap} món/loại): **${formatVND(upgradeCost)}**\n💰 Tiền mặt bạn có: **${formatVND(userData.money)}**`);
        }

        userData.money -= upgradeCost;
        userData.backpackLevel = currentLevel + 1;
        await userData.save();

        const nextUpgradeCost = 100000 * Math.pow(5, userData.backpackLevel);
        return replyEmbed(message, '#2ecc71', `🎉 **NÂNG CẤP BALO THÀNH CÔNG!**\n\n🎒 Cấp độ mới: **Level ${userData.backpackLevel}**\n📦 Sức chứa mới: **${nextCap} món mỗi loại**\n💸 Đã trừ: **-${formatVND(upgradeCost)}**\n💵 Phí nâng cấp lần tới: **${formatVND(nextUpgradeCost)}**`);
    }

    if (command === '.buy') {
        const item = args[1];
        if (!['1', '2', '3'].includes(item)) return replyEmbed(message, '#e67e22', "⚠️ Món này không bán! Nhập `.buy 1`, `.buy 2`, hoặc `.buy 3`.");
        
        const userData = await getUserMoney(userId);
        if (userData.money < 0) return replyEmbed(message, '#e74c3c', "❌ Cửa hàng không nhận tiền âm. Hãy đi cày trả nợ trước đi!");

        const maxCapacity = 5 + (userData.backpackLevel || 0) * 5; // Tính sức chứa tối đa hiện tại
        const shopData = await checkAndRestock(); 

        let price = 0, itemName = "", stockAmount = 0, userCurrentAmount = 0;
        if (item === '1') { price = 500000; itemName = "Lucky Point [I]"; stockAmount = shopData.stock1; userCurrentAmount = userData.luck1; }
        if (item === '2') { price = 750000; itemName = "Lucky Point [II]"; stockAmount = shopData.stock2; userCurrentAmount = userData.luck2; }
        if (item === '3') { price = 1750000; itemName = "Lucky Point [III]"; stockAmount = shopData.stock3; userCurrentAmount = userData.luck3; }

        if (userCurrentAmount >= maxCapacity) {
            return replyEmbed(message, '#e74c3c', `📦 Balo của bạn đã đạt giới hạn chứa loại này (**${userCurrentAmount}/${maxCapacity}** bình)!\nHãy gõ lệnh \`.ubp\` để nâng cấp sức chứa Balo.`);
        }

        if (stockAmount <= 0) return replyEmbed(message, '#e67e22', `📦 Ôi không! **${itemName}** đã cháy hàng. Bạn phải đợi đợt restock tiếp theo.`);
        if (userData.money < price) return replyEmbed(message, '#e74c3c', `❌ Thiếu tiền gòi bro! Cần **${formatVND(price)}** để rước ${itemName} về.`);

        userData.money -= price;
        if (item === '1') { userData.luck1 += 1; shopData.stock1 -= 1; }
        if (item === '2') { userData.luck2 += 1; shopData.stock2 -= 1; }
        if (item === '3') { userData.luck3 += 1; shopData.stock3 -= 1; }
        
        await userData.save();
        await shopData.save();

        return replyEmbed(message, '#2ecc71', `✅ Giao dịch thành công! Đã thêm **1x ${itemName}** vào balo.\nBalo hiện tại: **${userCurrentAmount + 1}/${maxCapacity}** bình.`);
    }

    if (command === '.backpack') {
        const userData = await getUserMoney(userId);
        const maxCap = 5 + (userData.backpackLevel || 0) * 5;
        const bpLevel = userData.backpackLevel || 0;
        const nextUpgradeCost = 100000 * Math.pow(5, bpLevel);
        
        let buffStatus = "Không có";
        if (userData.luckExpiry && userData.luckExpiry > Date.now()) {
            const timeLeft = Math.floor((userData.luckExpiry.getTime() - Date.now()) / 1000);
            buffStatus = `**+${userData.luckBuff.toFixed(2)}% may mắn** (Còn ${Math.floor(timeLeft/60)} phút ${timeLeft%60} giây)`;
        }

        const bpEmbed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('🎒 Balo Của Bạn')
            .setDescription(`✨ **Buff Kích Hoạt:** ${buffStatus}\n` +
                `🎒 **Cấp Balo:** Level ${bpLevel} (Sức chứa: **${maxCap}** món/loại)\n` +
                `💵 **Phí nâng cấp tiếp theo:** ${formatVND(nextUpgradeCost)} (\`.ubp\`)\n\n` +
                `**Vật phẩm đang có:**\n` +
                `🧪 **Lucky Point [I]:** ${userData.luck1}/${maxCap} bình *(Đã dùng: ${userData.usedLuck1 || 0})*\n` +
                `🧪 **Lucky Point [II]:** ${userData.luck2}/${maxCap} bình *(Đã dùng: ${userData.usedLuck2 || 0})*\n` +
                `🧪 **Lucky Point [III]:** ${userData.luck3}/${maxCap} bình *(Đã dùng: ${userData.usedLuck3 || 0})*\n\n` +
                `Mở nút dùng: \`.usepoint <1/2/3>\` | Nâng cấp: \`.ubp\``);
        return message.reply({ embeds: [bpEmbed] });
    }

    // ==========================================
    // LỆNH SỬ DỤNG THUỐC (ĐÃ CẬP NHẬT CƠ CHẾ KHÁNG THUỐC)
    // ==========================================
    if (command === '.usepoint') {
        const item = args[1];
        if (!['1', '2', '3'].includes(item)) return replyEmbed(message, '#e67e22', "⚠️ Sai cú pháp! Dùng `.usepoint 1/2/3`.");
        
        const userData = await getUserMoney(userId);
        
        if (item === '1' && userData.luck1 <= 0) return replyEmbed(message, '#e74c3c', "❌ Balo hết Lucky Point [I] rồi!");
        if (item === '2' && userData.luck2 <= 0) return replyEmbed(message, '#e74c3c', "❌ Balo hết Lucky Point [II] rồi!");
        if (item === '3' && userData.luck3 <= 0) return replyEmbed(message, '#e74c3c', "❌ Balo hết Lucky Point [III] rồi!");

        // Nếu buff đã hết hạn -> Reset lại chỉ số buff & bộ đếm số bình đã dùng
        if (!userData.luckExpiry || userData.luckExpiry <= Date.now()) {
            userData.luckBuff = 0;
            userData.usedLuck1 = 0;
            userData.usedLuck2 = 0;
            userData.usedLuck3 = 0;
        }

        let baseAmount = 0;
        let usedCount = 0;

        if (item === '1') {
            userData.luck1 -= 1;
            baseAmount = 3;
            usedCount = userData.usedLuck1 || 0;
        } else if (item === '2') {
            userData.luck2 -= 1;
            baseAmount = 6;
            usedCount = userData.usedLuck2 || 0;
        } else if (item === '3') {
            userData.luck3 -= 1;
            baseAmount = 12;
            usedCount = userData.usedLuck3 || 0;
        }

        // TÍNH TOÁN CƠ CHẾ KHÁNG THUỐC
        // Mỗi 3 lọ cùng loại sẽ giảm 50% hiệu quả (tier = floor(usedCount / 3))
        const tier = Math.floor(usedCount / 3);
        const effMultiplier = Math.pow(0.5, tier); // 1.0 (100%), 0.5 (50%), 0.25 (25%), ...
        const actualBuff = baseAmount * effMultiplier;

        // Cập nhật lượt dùng
        if (item === '1') userData.usedLuck1 = usedCount + 1;
        if (item === '2') userData.usedLuck2 = usedCount + 1;
        if (item === '3') userData.usedLuck3 = usedCount + 1;

        userData.luckBuff = parseFloat((userData.luckBuff + actualBuff).toFixed(4));
        userData.luckExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 phút
        await userData.save();

        let resistanceNote = "";
        if (tier > 0) {
            resistanceNote = `\n⚠️ *Kháng thuốc (Đã dùng lọ thứ ${usedCount + 1}): Hiệu quả bị giảm còn ${(effMultiplier * 100).toFixed(1)}%!*`;
        }

        return replyEmbed(message, '#2ecc71', `🧪 Ực ực... Bạn đã uống **Lucky Point [${item === '1' ? 'I' : item === '2' ? 'II' : 'III'}]**!\nHiệu ứng nhận được: **+${actualBuff.toFixed(2)}%** may mắn.${resistanceNote}\n✨ **Tổng may mắn hiện tại:** +${userData.luckBuff.toFixed(2)}% (Duy trì 5 phút).`);
    }

    if (command === '.earnmoney') {
        let risk = 0; 
        if (args[1]) {
            risk = parseInt(args[1].replace('%', ''));
            if (isNaN(risk) || risk < 0) risk = 0;
            if (risk > 99) risk = 99; 
        }

        const pendingEmbed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('⏳ Bot đang đi kiếm tiền cho bạn, chờ 3 giây nhé...');
        
        const pendingMsg = await message.reply({ embeds: [pendingEmbed] });

        setTimeout(async () => {
            const userData = await getUserMoney(userId); 
            
            let winChance = 100 - risk; 

            let activeBuff = 0;
            if (userData.luckExpiry && userData.luckExpiry > Date.now()) {
                activeBuff = userData.luckBuff;
                winChance += activeBuff; 
            } else if (userData.luckExpiry && userData.luckExpiry <= Date.now() && userData.luckBuff > 0) {
                // Buff đã hết hạn -> Reset toàn bộ chỉ số buff & kháng thuốc
                userData.luckBuff = 0; 
                userData.usedLuck1 = 0;
                userData.usedLuck2 = 0;
                userData.usedLuck3 = 0;
                await userData.save();
            }

            const isWin = (Math.random() * 100) <= winChance; 
            let resultEmbed = new EmbedBuilder();

            if (isWin) {
                const minWin = 100 + (risk * 1000); 
                const maxWin = 1000 + (risk * 3000); 
                const earned = Math.floor(Math.random() * (maxWin - minWin + 1)) + minWin;

                userData.money += earned;
                await userData.save(); 

                let winDesc = `Bạn mạo hiểm **${risk}%** và thắng đậm!\n\n💸 Nhận: **+${formatVND(earned)}**\n💰 Tiền mặt hiện tại: **${formatVND(userData.money)}**`;
                if (activeBuff > 0) winDesc += `\n✨ *(Nhờ có +${activeBuff.toFixed(2)}% may mắn độ trì!)*`;

                resultEmbed.setColor('#2ecc71').setTitle('🎉 Chúc Mừng!').setDescription(winDesc);
            } else {
                const minLose = 500 + (risk * 500);
                const maxLose = 1000 + (risk * 2000);
                let lost = Math.floor(Math.random() * (maxLose - minLose + 1)) + minLose;

                userData.money -= lost; 
                await userData.save(); 

                let loseDesc = `Mạo hiểm **${risk}%** nhưng dẫm nhầm mìn, toang rồi!\n\n💸 Bị trừ: **-${formatVND(lost)}**\n💰 Tiền mặt hiện tại: **${formatVND(userData.money)}**`;
                if (activeBuff > 0) loseDesc += `\n😭 *(Dù đã cắn bình +${activeBuff.toFixed(2)}% may mắn nhưng vẫn quá đen!)*`;

                resultEmbed.setColor('#e74c3c').setTitle('😭 Toang Rồi!').setDescription(loseDesc);
            }

            pendingMsg.edit({ embeds: [resultEmbed] });
        }, 3000);
        return;
    }

    if (command === '.addmoney') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới có quyền "in tiền"!');
        
        const targetUser = message.mentions.users.first();
        const amountStr = args[2];
        if (!targetUser || !amountStr) return replyEmbed(message, '#e67e22', '⚠️ Sai cú pháp! Ví dụ: `.addmoney @user 1000000`');

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return replyEmbed(message, '#e67e22', '⚠️ Số tiền không hợp lệ!');

        const targetData = await getUserMoney(targetUser.id);
        targetData.money += amount;
        await targetData.save();
        return replyEmbed(message, '#2ecc71', `✅ Đã bơm **${formatVND(amount)}** vào tài khoản của **${targetUser.username}**.`);
    }

    if (command === '.removemoney') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới có quyền thu hồi tiền!');
        
        const targetUser = message.mentions.users.first();
        const amountStr = args[2];
        if (!targetUser || !amountStr) return replyEmbed(message, '#e67e22', '⚠️ Sai cú pháp! Ví dụ: `.removemoney @user 50000`');

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return replyEmbed(message, '#e67e22', '⚠️ Số tiền không hợp lệ!');

        const targetData = await getUserMoney(targetUser.id);
        targetData.money -= amount; 
        await targetData.save();
        return replyEmbed(message, '#2ecc71', `✅ Đã thu hồi **${formatVND(amount)}** từ tài khoản của **${targetUser.username}**.`);
    }

    if (command === '.givemoney') {
        const targetUser = message.mentions.users.first();
        const amountStr = args[2];
        if (!targetUser || !amountStr) return replyEmbed(message, '#e67e22', '⚠️ Sai cú pháp! Ví dụ: `.givemoney @user 50000`');
        if (targetUser.id === message.author.id) return replyEmbed(message, '#e67e22', '⚠️ Không thể tự chuyển cho chính mình!');

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return replyEmbed(message, '#e67e22', '⚠️ Số tiền không hợp lệ!');

        const senderData = await getUserMoney(userId);
        if (senderData.money < amount) return replyEmbed(message, '#e74c3c', `❌ Bạn không đủ tiền! Số dư của bạn: **${formatVND(senderData.money)}**`);

        const targetData = await getUserMoney(targetUser.id);
        senderData.money -= amount;
        targetData.money += amount;
        
        await senderData.save();
        await targetData.save();

        const transferEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('💸 Chuyển Khoản Thành Công')
            .setDescription(`**${message.author.username}** đã chuyển cho **${targetUser.username}**:\n\n💵 **${formatVND(amount)}**`);
        return message.reply({ embeds: [transferEmbed] });
    }

    if (command === '.newcommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyEmbed(message, '#e74c3c', 'Chỉ Admin mới được dùng lệnh này nha bro!', '❌ Thất Bại');
        }
        if (args.length < 3) {
            return replyEmbed(message, '#f1c40f', 'Ví dụ chuẩn: `.newcommand .hello Chào cậu`', '⚠️ Sai cú pháp');
        }
        const newCmd = args[1].toLowerCase();
        const response = args.slice(2).join(' '); 
        
        customCommands[newCmd] = response;
        
        await CustomCmd.findOneAndUpdate({ cmdName: newCmd }, { response: response }, { upsert: true, new: true });
        return replyEmbed(message, '#2ecc71', `Đã tạo/cập nhật lệnh **${newCmd}** thành công!`, '✅ Hệ Thống Lệnh');
    }

    if (command === '.removecommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới được dùng lệnh này!');
        
        const targetCmd = args[1]?.toLowerCase();
        
        if (customCommands[targetCmd]) {
            delete customCommands[targetCmd];
            await CustomCmd.findOneAndDelete({ cmdName: targetCmd });
            return replyEmbed(message, '#2ecc71', `✅ Đã xóa lệnh **${targetCmd}** thành công!`);
        } else {
            return replyEmbed(message, '#e67e22', '⚠️ Không tìm thấy lệnh này trong hệ thống.');
        }
    }

    if (command === '.help') {
        const cmds = Object.keys(customCommands);
        let desc = cmds.length === 0 ? 'Hiện tại chưa có lệnh custom nào.' : cmds.map(c => `• \`${c}\``).join('\n');
        
        const helpEmbed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('📜 Danh Sách Lệnh')
            .setDescription(
                `**👮 Hệ thống Cảnh Sát :**\n` +
                `• \`.setupprison <#kênh> <@role>\` - Thiết lập nhà tù\n` +
                `• \`.vaotu [@user] <số lần> [lý do]\` - Tống vào tù\n` +
                `• \`.ratu [@user]\` - Ân xá sớm không cần làm nhiệm vụ\n\n` +
                `**🧹 Dành cho Tù Nhân:**\n` +
                `• \`.cleanup\` - Quét dọn trong kênh tù để giảm án\n\n` +
                `**🏦 Kinh tế & Ngân hàng:**\n` +
                `• \`.money [@user]\` - Xem ví & sổ tiết kiệm\n` +
                `• \`.earnmoney [0-99%]\` - Kiếm tiền (thêm % để tự chọn rủi ro)\n` +
                `• \`.steal [@user]\` - Ăn trộm tiền\n` +
                `• \`.doubleornothing\` / \`.don <số tiền>\` - Gấp đôi hoặc mất trắng\n` +
                `• \`.deposit [số tiền/all]\` - Gửi tiền vào ngân hàng\n` +
                `• \`.withdraw [số tiền/all]\` - Rút tiền từ ngân hàng\n` +
                `• \`.givemoney [@user] [số tiền]\` - Chuyển khoản\n\n` +
                `**🛒 Cửa hàng & Balo:**\n` +
                `• \`.luckyshop\` - Xem gian hàng may mắn\n` +
                `• \`.buy <1/2/3>\` - Mua nước may mắn\n` +
                `• \`.backpack\` - Xem túi đồ & trạng thái buff\n` +
                `• \`.usepoint <1/2/3>\` - Dùng nước may mắn (có kháng thuốc)\n` +
                `• \`.upgradebackpack\` / \`.ubp\` - Nâng cấp sức chứa Balo\n\n` +
                `**🤖 Lệnh Custom:**\n${desc}`);
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