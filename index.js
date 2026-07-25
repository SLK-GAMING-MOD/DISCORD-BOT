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

// 1. Schema User (Cập nhật thêm Mặt nạ & Bí kíp Steal)
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    money: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    lastInterestUpdate: { type: Date, default: Date.now },
    luck1: { type: Number, default: 0 }, 
    luck2: { type: Number, default: 0 }, 
    luck3: { type: Number, default: 0 }, 
    mask: { type: Number, default: 0 },           // Item 4: Mặt nạ bịt mặt
    hasStealScroll: { type: Boolean, default: false }, // Item 5: Bí kíp Steal (Vĩnh viễn)
    luckBuff: { type: Number, default: 0 }, 
    luckExpiry: { type: Date, default: null },
    stealCooldown: { type: Date, default: null },
    backpackLevel: { type: Number, default: 0 }, 
    usedLuck1: { type: Number, default: 0 },     
    usedLuck2: { type: Number, default: 0 },     
    usedLuck3: { type: Number, default: 0 }      
});
const UserMoney = mongoose.model('UserMoney', userSchema);

const commandSchema = new mongoose.Schema({
    cmdName: { type: String, required: true, unique: true },
    response: { type: String, required: true }
});
const CustomCmd = mongoose.model('CustomCmd', commandSchema);

// 2. Schema Shop (Cập nhật thêm stock 4 & stock 5)
const shopSchema = new mongoose.Schema({
    shopId: { type: String, default: "global" },
    stock1: { type: Number, default: 0 },
    stock2: { type: Number, default: 0 },
    stock3: { type: Number, default: 0 },
    stock4: { type: Number, default: 0 }, // Mặt nạ
    stock5: { type: Number, default: 0 }, // Bí kíp steal
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

// Hàm lấy thông tin món hàng theo ID
function getItemInfo(itemId) {
    switch(itemId) {
        case '1': return { id: '1', name: "Lucky Point [I]", price: 500000, key: "luck1", stockKey: "stock1", isPoint: true };
        case '2': return { id: '2', name: "Lucky Point [II]", price: 750000, key: "luck2", stockKey: "stock2", isPoint: true };
        case '3': return { id: '3', name: "Lucky Point [III]", price: 1750000, key: "luck3", stockKey: "stock3", isPoint: true };
        case '4': return { id: '4', name: "Mặt Nạ Bịt Mặt", price: 100000, key: "mask", stockKey: "stock4", isPoint: false };
        case '5': return { id: '5', name: "Bí Kíp Steal", price: 5000000, key: "hasStealScroll", stockKey: "stock5", isPoint: false, isUnique: true };
        default: return null;
    }
}

async function checkAndRestock() {
    let shop = await Shop.findOne({ shopId: "global" });
    const now = Date.now();
    const thirtyMins = 30 * 60 * 1000;
    const currentPeriod = Math.floor(now / thirtyMins) * thirtyMins; 
    
    if (!shop) {
        shop = new Shop({
            shopId: "global",
            stock1: Math.floor(Math.random() * 5) + 1,
            stock2: Math.floor(Math.random() * 5) + 1,
            stock3: Math.floor(Math.random() * 5) + 1,
            stock4: Math.floor(Math.random() * 5) + 1,
            stock5: Math.floor(Math.random() * 2) + 1,
            lastRestock: new Date(currentPeriod)
        });
        await shop.save();
        return shop;
    }

    if (now >= shop.lastRestock.getTime() + thirtyMins) {
        shop.stock1 = Math.floor(Math.random() * 5) + 1;
        shop.stock2 = Math.floor(Math.random() * 5) + 1;
        shop.stock3 = Math.floor(Math.random() * 5) + 1;
        shop.stock4 = Math.floor(Math.random() * 5) + 1;
        shop.stock5 = Math.floor(Math.random() * 2) + 1;
        shop.lastRestock = new Date(currentPeriod);
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

// Anti-Escape System
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
    // HỆ THỐNG NHÀ TÙ
    // ==========================================

    if (command === '.setupprison') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới có quyền thiết lập nhà tù!');

        const channelMention = message.mentions.channels.first();
        const roleMention = message.mentions.roles.first();

        if (!channelMention || !roleMention) {
            return replyEmbed(message, '#e67e22', '⚠️ Cú pháp sai! Dùng: `.setupprison #tên_kênh_tù @tên_role_tù_nhân`');
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
            return replyEmbed(message, '#e74c3c', '❌ Không thể bỏ tù người này! Kiểm tra phân cấp Role của bot.');
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
                    return replyEmbed(message, '#2ecc71', `🎉 Chúc mừng <@${userId}> đã cải tạo tốt, hoàn thành hình phạt và được ân xá!`);
                } catch (err) {
                    return replyEmbed(message, '#e74c3c', '❌ Bị lỗi khi thả tự do, vui lòng gọi Admin cứu!');
                }
            }
        } else {
            await prisoner.save();
            return replyEmbed(message, '#3498db', `🧹 <@${userId}> đang tích cực dọn dẹp... Còn lại: **${prisoner.tasksRemaining} lần**.`);
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
            return replyEmbed(message, '#2ecc71', `✅ Đã ân xá đặc biệt cho **${targetMember.user.username}**.`);
        } catch (err) {
            return replyEmbed(message, '#e74c3c', '❌ Có lỗi xảy ra khi trả lại role.');
        }
    }

    // ==========================================
    // HỆ THỐNG KINHTẾ (ECONOMY)
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
        if (userData.money <= 0) return replyEmbed(message, '#e74c3c', "❌ Bạn đang nợ nần hoặc sạch túi!");
        
        await applyInterest(userData); 
        
        let amount = amountStr.toLowerCase() === 'all' ? userData.money : parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > userData.money) return replyEmbed(message, '#e67e22', "⚠️ Số tiền gửi không hợp lệ!");
        
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
        if (isNaN(amount) || amount <= 0 || amount > userData.bank) return replyEmbed(message, '#e67e22', "⚠️ Số dư trong ngân hàng không đủ!");
        
        userData.bank -= amount;
        userData.money += amount;
        await userData.save();
        return replyEmbed(message, '#2ecc71', `🏦 Giao dịch thành công!\nBạn đã rút **${formatVND(amount)}** ra ví tiền mặt.`);
    }

    if (command === '.doubleornothing' || command === '.don') {
        const amountStr = args[1];
        if (!amountStr) return replyEmbed(message, '#e67e22', '⚠️ Dùng: `.don <số tiền>` hoặc `.don all`');

        const userData = await getUserMoney(userId);
        if (userData.money <= 0) return replyEmbed(message, '#e74c3c', '❌ Bạn không có tiền để chơi!');

        let amount = amountStr.toLowerCase() === 'all' ? userData.money : parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > userData.money) return replyEmbed(message, '#e67e22', '⚠️ Số tiền cược không hợp lệ!');

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
                 .setDescription(`Bạn đã mất trắng số tiền cược.\n\n💸 Tiền mất: **-${formatVND(amount)}**\n💰 Tiền mặt hiện tại: **${formatVND(userData.money)}**`);
        }
        await userData.save();
        return message.reply({ embeds: [embed] });
    }

    // LỆNH STEAL (ĐÃ CẬP NHẬT TÍNH NĂNG MẶT NẠ & BÍ KÍP)
    if (command === '.steal') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) return replyEmbed(message, '#e67e22', "⚠️ Dùng: `.steal @ai_đó`");
        if (targetUser.id === userId) return replyEmbed(message, '#e67e22', "⚠️ Tự móc túi mình chi bro?");

        const attacker = await getUserMoney(userId);

        if (attacker.stealCooldown && attacker.stealCooldown > Date.now()) {
            const timeLeft = Math.ceil((attacker.stealCooldown.getTime() - Date.now()) / 60000);
            return replyEmbed(message, '#e74c3c', `⏳ Bạn đang bị tạm giam! Chờ **${timeLeft} phút** nữa nhé.`);
        }

        const target = await getUserMoney(targetUser.id);
        
        // Tính toán tỷ lệ thành công
        let winChance = 0.015; // Tỷ lệ gốc 1.5%
        let itemNotes = [];

        if (attacker.hasStealScroll) {
            winChance += 0.02; // Bí kíp +2% vĩnh viễn
            itemNotes.push("📜 Bí kíp Steal (+2%)");
        }

        if (attacker.mask > 0) {
            attacker.mask -= 1; // Tiêu tốn 1 mặt nạ
            winChance += 0.015; // Mặt nạ +1.5%
            itemNotes.push("🎭 Mặt Nạ Bịt Mặt (+1.5%)");
        }

        const isSuccess = Math.random() < winChance;
        const totalPercentText = (winChance * 100).toFixed(1) + "%";

        if (isSuccess) {
            if (target.money <= 0) {
                await attacker.save();
                return replyEmbed(message, '#f1c40f', `🕵️ Trộm thành công (Tỷ lệ: ${totalPercentText})! Nhưng **${targetUser.username}** không có đồng nào trong ví!`);
            }
            const stolenAmount = target.money;
            attacker.money += stolenAmount;
            target.money = 0; 
            
            await attacker.save();
            await target.save();
            
            let noteStr = itemNotes.length > 0 ? `\n*Trang bị sử dụng: ${itemNotes.join(', ')}*` : '';
            return replyEmbed(message, '#2ecc71', `🎉 **ĐỈNH CAO ĐẠO CHÍCH!** (Tỷ lệ: ${totalPercentText})\nBạn đã vét sạch ví của **${targetUser.username}**.\n💵 Chiếm đoạt: **${formatVND(stolenAmount)}**${noteStr}`);
        } else {
            await applyInterest(attacker); 

            if (attacker.money > 0) {
                const penalty = Math.floor(attacker.money / 2); 
                attacker.money -= penalty;
                await attacker.save();
                return replyEmbed(message, '#e74c3c', `🚨 **BỊ BẮT QUẢ TANG!** (Tỷ lệ: ${totalPercentText})\nBạn ăn trộm thất bại và bị phạt 50% tiền mặt.\n💸 Hình phạt: **-${formatVND(penalty)}**.`);
            } else if (attacker.bank > 0) {
                const penalty = Math.floor(attacker.bank / 2); 
                attacker.bank -= penalty;
                await attacker.save();
                return replyEmbed(message, '#e74c3c', `🚨 **BỊ BẮT QUẢ TANG!** (Tỷ lệ: ${totalPercentText})\nĂn trộm thất bại! Cảnh sát trích thu từ ngân hàng.\n💸 Hình phạt: **-${formatVND(penalty)}**.`);
            } else {
                attacker.stealCooldown = new Date(Date.now() + 60 * 60 * 1000); 
                await attacker.save();
                return replyEmbed(message, '#e74c3c', `🚨 **BỊ BẮT QUẢ TANG!** (Tỷ lệ: ${totalPercentText})\nBạn ăn trộm thất bại và bị tống giam **1 giờ**!`);
            }
        }
    }

    // ==========================================
    // ITEM SHOP & BALO (ĐÃ ĐỔI TÊN & NÂNG CẤP)
    // ==========================================

    if (command === '.itemshop' || command === '.luckyshop') {
        const shopData = await checkAndRestock();
        const getStockText = (stock) => stock > 0 ? `*(Còn: **${stock}**)*` : `*(**Hết hàng!**)*`;

        const nextRestock = shopData.lastRestock.getTime() + 30 * 60 * 1000;
        const nextRestockUnix = Math.floor(nextRestock / 1000);

        const shopEmbed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('🛒 Item Shop - Cửa Hàng Vật Phẩm')
            .setDescription(`Hàng hóa tự động làm mới mỗi 30 phút!\n⏳ *Restock tiếp theo:* <t:${nextRestockUnix}:t> (<t:${nextRestockUnix}:R>)\n\n` +
                `🧪 **1. Lucky Point [I]** - \`500,000 VNĐ\` (+3% win earnmoney)\n   ↳ ${getStockText(shopData.stock1)}\n` +
                `🧪 **2. Lucky Point [II]** - \`750,000 VNĐ\` (+6% win earnmoney)\n   ↳ ${getStockText(shopData.stock2)}\n` +
                `🧪 **3. Lucky Point [III]** - \`1,750,000 VNĐ\` (+12% win earnmoney)\n   ↳ ${getStockText(shopData.stock3)}\n` +
                `🎭 **4. Mặt Nạ Bịt Mặt** - \`100,000 VNĐ\` (+1.5% tỷ lệ Steal/1 lần steal)\n   ↳ ${getStockText(shopData.stock4)}\n` +
                `📜 **5. Bí Kíp Steal** - \`5,000,000 VNĐ\` (+2% tỷ lệ Steal Vĩnh Viễn)\n   ↳ ${getStockText(shopData.stock5)}\n\n` +
                '🔹 **Mua:** `.buy <1-5> [số lượng/all]` | 🔹 **Dùng Thuốc:** `.usepoint <1-3> [số lượng/all]`\n🔹 **Tặng:** `.givepoint @user <1-4> <số lượng>` | 🔹 **Balo:** `.backpack`')
            .setFooter({ text: 'Thương nhân: Hàng hóa được cập nhật thường xuyên!' });
        return message.reply({ embeds: [shopEmbed] });
    }

    if (command === '.upgradebackpack' || command === '.ubp') {
        const userData = await getUserMoney(userId);
        if (userData.money < 0) return replyEmbed(message, '#e74c3c', '❌ Cửa hàng không nhận tiền âm!');

        const currentLevel = userData.backpackLevel || 0;
        const upgradeCost = 100000 * Math.pow(5, currentLevel); 
        const currentCap = 5 + currentLevel * 5;
        const nextCap = currentCap + 5;

        if (userData.money < upgradeCost) {
            return replyEmbed(message, '#e74c3c', `❌ Bạn không đủ tiền nâng cấp balo!\n\n🎒 **Level ${currentLevel}** (Tối đa ${currentCap} món/loại)\n💵 Phí nâng lên **Level ${currentLevel + 1}**: **${formatVND(upgradeCost)}**`);
        }

        userData.money -= upgradeCost;
        userData.backpackLevel = currentLevel + 1;
        await userData.save();

        return replyEmbed(message, '#2ecc71', `🎉 **NÂNG CẤP BALO THÀNH CÔNG!**\n\n🎒 Level mới: **Level ${userData.backpackLevel}**\n📦 Sức chứa mới: **${nextCap} món/loại**\n💸 Đã trừ: **-${formatVND(upgradeCost)}**`);
    }

    // LỆNH MUA HÀNG (HỖ TRỢ MUA ALL VÀ SỐ LƯỢNG)
    if (command === '.buy') {
        const itemId = args[1];
        const itemInfo = getItemInfo(itemId);
        if (!itemInfo) return replyEmbed(message, '#e67e22', "⚠️ Mã vật phẩm không hợp lệ! Nhập `.buy <1-5> [số lượng/all]`.");
        
        const userData = await getUserMoney(userId);
        if (userData.money < 0) return replyEmbed(message, '#e74c3c', "❌ Cửa hàng không nhận tiền âm!");

        const maxCap = 5 + (userData.backpackLevel || 0) * 5;
        const shopData = await checkAndRestock(); 

        if (itemInfo.isUnique && userData.hasStealScroll) {
            return replyEmbed(message, '#e67e22', "⚠️ Bạn đã sở hữu Bí Kíp Steal rồi, không thể mua thêm!");
        }

        const currentQty = itemInfo.isUnique ? 0 : (userData[itemInfo.key] || 0);
        const stockAvailable = shopData[itemInfo.stockKey];

        if (stockAvailable <= 0) return replyEmbed(message, '#e67e22', `📦 Ôi không! **${itemInfo.name}** đã cháy hàng.`);

        if (!itemInfo.isUnique && currentQty >= maxCap) {
            return replyEmbed(message, '#e74c3c', `📦 Balo đầy chỗ cho món này (**${currentQty}/${maxCap}**)! Gõ \`.ubp\` để nâng cấp sức chứa.`);
        }

        let buyQty = 1;
        const qtyParam = args[2] ? args[2].toLowerCase() : '1';

        if (itemInfo.isUnique) {
            buyQty = 1;
        } else if (qtyParam === 'all') {
            const maxByMoney = Math.floor(userData.money / itemInfo.price);
            const maxBySpace = maxCap - currentQty;
            buyQty = Math.min(maxByMoney, stockAvailable, maxBySpace);

            if (buyQty <= 0) {
                if (maxByMoney <= 0) return replyEmbed(message, '#e74c3c', `❌ Bạn không đủ tiền mua 1x **${itemInfo.name}**!`);
                if (maxBySpace <= 0) return replyEmbed(message, '#e74c3c', `📦 Balo không còn chỗ chứa thêm **${itemInfo.name}**!`);
            }
        } else {
            buyQty = parseInt(qtyParam);
            if (isNaN(buyQty) || buyQty <= 0) return replyEmbed(message, '#e67e22', "⚠️ Số lượng mua không hợp lệ!");
            if (buyQty > stockAvailable) return replyEmbed(message, '#e67e22', `📦 Trong kho chỉ còn **${stockAvailable}** cái!`);
            if (currentQty + buyQty > maxCap) return replyEmbed(message, '#e74c3c', `📦 Balo chỉ chứa thêm được **${maxCap - currentQty}** món nữa!`);
        }

        const totalCost = itemInfo.price * buyQty;
        if (userData.money < totalCost) {
            return replyEmbed(message, '#e74c3c', `❌ Cần **${formatVND(totalCost)}** để mua ${buyQty}x ${itemInfo.name}. Bạn không đủ tiền!`);
        }

        userData.money -= totalCost;
        shopData[itemInfo.stockKey] -= buyQty;

        if (itemInfo.isUnique) {
            userData.hasStealScroll = true;
        } else {
            userData[itemInfo.key] = (userData[itemInfo.key] || 0) + buyQty;
        }
        
        await userData.save();
        await shopData.save();

        const statusStr = itemInfo.isUnique ? "Đã sở hữu" : `${userData[itemInfo.key]}/${maxCap}`;
        return replyEmbed(message, '#2ecc71', `✅ Đã mua thành công **${buyQty}x ${itemInfo.name}**!\n💸 Tổng tiền: **-${formatVND(totalCost)}**\n🎒 Túi đồ: **${statusStr}**.`);
    }

    if (command === '.backpack') {
        const userData = await getUserMoney(userId);
        const maxCap = 5 + (userData.backpackLevel || 0) * 5;
        const bpLevel = userData.backpackLevel || 0;
        
        let buffStatus = "Không có";
        if (userData.luckExpiry && userData.luckExpiry > Date.now()) {
            const timeLeft = Math.floor((userData.luckExpiry.getTime() - Date.now()) / 1000);
            buffStatus = `**+${userData.luckBuff.toFixed(2)}% may mắn** (Còn ${Math.floor(timeLeft/60)}p ${timeLeft%60}s)`;
        }

        const bpEmbed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('🎒 Balo Của Bạn')
            .setDescription(`✨ **Buff Kích Hoạt:** ${buffStatus}\n` +
                `🎒 **Cấp Balo:** Level ${bpLevel} (Sức chứa: **${maxCap}** món/loại)\n\n` +
                `**Vật Phẩm Trong Túi:**\n` +
                `🧪 **Lucky Point [I]:** ${userData.luck1}/${maxCap} bình *(Đã dùng: ${userData.usedLuck1 || 0})*\n` +
                `🧪 **Lucky Point [II]:** ${userData.luck2}/${maxCap} bình *(Đã dùng: ${userData.usedLuck2 || 0})*\n` +
                `🧪 **Lucky Point [III]:** ${userData.luck3}/${maxCap} bình *(Đã dùng: ${userData.usedLuck3 || 0})*\n` +
                `🎭 **Mặt Nạ Bịt Mặt:** ${userData.mask || 0}/${maxCap} cái\n` +
                `📜 **Bí Kíp Steal:** ${userData.hasStealScroll ? '✅ Đã Học (+2% tỷ lệ)' : '❌ Chưa Có'}\n\n` +
                `🔹 Dùng thuốc: \`.usepoint <1/2/3> [số lượng/all]\` | Nâng cấp: \`.ubp\``);
        return message.reply({ embeds: [bpEmbed] });
    }

    // LỆNH SỬ DỤNG THUỐC (HỖ TRỢ DÙNG ALL & SỐ LƯỢNG MỚI)
    if (command === '.usepoint') {
        const item = args[1];
        if (!['1', '2', '3'].includes(item)) return replyEmbed(message, '#e67e22', "⚠️ Chỉ dùng được cho thuốc May Mắn (1, 2, 3)! Ví dụ: `.usepoint 3 5` hoặc `.usepoint 3 all`.");
        
        const userData = await getUserMoney(userId);
        const itemKey = item === '1' ? 'luck1' : item === '2' ? 'luck2' : 'luck3';
        const usedKey = item === '1' ? 'usedLuck1' : item === '2' ? 'usedLuck2' : 'usedLuck3';
        const baseAmount = item === '1' ? 3 : item === '2' ? 6 : 12;

        const currentQty = userData[itemKey] || 0;
        if (currentQty <= 0) return replyEmbed(message, '#e74c3c', `❌ Balo hết Lucky Point [${item === '1' ? 'I' : item === '2' ? 'II' : 'III'}] rồi!`);

        let useQty = 1;
        const qtyParam = args[2] ? args[2].toLowerCase() : '1';

        if (qtyParam === 'all') {
            useQty = currentQty;
        } else {
            useQty = parseInt(qtyParam);
            if (isNaN(useQty) || useQty <= 0) return replyEmbed(message, '#e67e22', "⚠️ Số lượng sử dụng không hợp lệ!");
            if (useQty > currentQty) return replyEmbed(message, '#e74c3c', `❌ Bạn chỉ có **${currentQty}** bình trong balo!`);
        }

        // Reset buff nếu đã hết hạn
        if (!userData.luckExpiry || userData.luckExpiry <= Date.now()) {
            userData.luckBuff = 0;
            userData.usedLuck1 = 0;
            userData.usedLuck2 = 0;
            userData.usedLuck3 = 0;
        }

        let startUsedCount = userData[usedKey] || 0;
        let addedBuff = 0;

        // Tính toán kháng thuốc từng lọ
        for (let i = 0; i < useQty; i++) {
            let currentCount = startUsedCount + i;
            let tier = Math.floor(currentCount / 3);
            let effMultiplier = Math.pow(0.5, tier);
            addedBuff += baseAmount * effMultiplier;
        }

        userData[itemKey] -= useQty;
        userData[usedKey] = startUsedCount + useQty;
        userData.luckBuff = parseFloat((userData.luckBuff + addedBuff).toFixed(4));
        userData.luckExpiry = new Date(Date.now() + 5 * 60 * 1000); 
        await userData.save();

        return replyEmbed(message, '#2ecc71', `🧪 Ực ực... Bạn đã uống **${useQty}x Lucky Point [${item === '1' ? 'I' : item === '2' ? 'II' : 'III'}]**!\nHiệu ứng nhận thêm: **+${addedBuff.toFixed(2)}%** may mắn.\n✨ **Tổng may mắn hiện tại:** +${userData.luckBuff.toFixed(2)}% (Duy trì 5 phút).`);
    }

    // LỆNH TẶNG VẬT PHẨM
    if (command === '.givepoint') {
        const targetUser = message.mentions.users.first();
        const itemId = args[2];
        const qtyStr = args[3];

        if (!targetUser || !itemId || !qtyStr) {
            return replyEmbed(message, '#e67e22', '⚠️ Cú pháp: `.givepoint @user <1-4> <số lượng>`\nVí dụ: `.givepoint @ai_đó 3 5`');
        }
        if (targetUser.id === message.author.id) return replyEmbed(message, '#e67e22', '⚠️ Không thể tự tặng cho chính mình!');

        const itemInfo = getItemInfo(itemId);
        if (!itemInfo || itemInfo.isUnique) {
            return replyEmbed(message, '#e67e22', '⚠️ Món đồ này không hợp lệ hoặc không thể chuyển giao!');
        }

        const quantity = parseInt(qtyStr);
        if (isNaN(quantity) || quantity <= 0) return replyEmbed(message, '#e67e22', '⚠️ Số lượng tặng không hợp lệ!');

        const senderData = await getUserMoney(userId);
        const senderQty = senderData[itemInfo.key] || 0;

        if (senderQty < quantity) {
            return replyEmbed(message, '#e74c3c', `❌ Bạn không đủ **${itemInfo.name}**! Đang có: **${senderQty}**.`);
        }

        const targetData = await getUserMoney(targetUser.id);
        const targetMaxCap = 5 + (targetData.backpackLevel || 0) * 5;
        const targetQty = targetData[itemInfo.key] || 0;

        if (targetQty + quantity > targetMaxCap) {
            return replyEmbed(message, '#e74c3c', `❌ Balo của **${targetUser.username}** chỉ chứa thêm được **${targetMaxCap - targetQty}** món này!`);
        }

        senderData[itemInfo.key] -= quantity;
        targetData[itemInfo.key] = (targetData[itemInfo.key] || 0) + quantity;

        await senderData.save();
        await targetData.save();

        return replyEmbed(message, '#3498db', `🎁 **GIAO DỊCH THÀNH CÔNG**\n**${message.author.username}** đã tặng cho **${targetUser.username}**:\n📦 **${quantity}x ${itemInfo.name}**`);
    }

    // LỆNH ADMIN: THÊM VẬT PHẨM
    if (command === '.addpoint') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới có quyền thực hiện!');

        const targetUser = message.mentions.users.first();
        const itemId = args[2];
        const qtyStr = args[3];

        if (!targetUser || !itemId || (!qtyStr && itemId !== '5')) {
            return replyEmbed(message, '#e67e22', '⚠️ Cú pháp: `.addpoint @user <1-5> <số lượng>`');
        }

        const itemInfo = getItemInfo(itemId);
        if (!itemInfo) return replyEmbed(message, '#e67e22', '⚠️ ID vật phẩm không hợp lệ (1-5)!');

        const targetData = await getUserMoney(targetUser.id);

        if (itemInfo.isUnique) {
            targetData.hasStealScroll = true;
            await targetData.save();
            return replyEmbed(message, '#2ecc71', `✅ Đã cấp **${itemInfo.name}** cho **${targetUser.username}**.`);
        }

        const quantity = parseInt(qtyStr);
        if (isNaN(quantity) || quantity <= 0) return replyEmbed(message, '#e67e22', '⚠️ Số lượng không hợp lệ!');

        targetData[itemInfo.key] = (targetData[itemInfo.key] || 0) + quantity;
        await targetData.save();

        return replyEmbed(message, '#2ecc71', `✅ Đã cấp **${quantity}x ${itemInfo.name}** cho **${targetUser.username}**.`);
    }

    // LỆNH ADMIN: THU HỒI VẬT PHẨM
    if (command === '.removepoint') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
            return replyEmbed(message, '#e74c3c', '❌ Chỉ Admin mới có quyền thực hiện!');

        const targetUser = message.mentions.users.first();
        const itemId = args[2];
        const qtyStr = args[3];

        if (!targetUser || !itemId || (!qtyStr && itemId !== '5')) {
            return replyEmbed(message, '#e67e22', '⚠️ Cú pháp: `.removepoint @user <1-5> <số lượng>`');
        }

        const itemInfo = getItemInfo(itemId);
        if (!itemInfo) return replyEmbed(message, '#e67e22', '⚠️ ID vật phẩm không hợp lệ (1-5)!');

        const targetData = await getUserMoney(targetUser.id);

        if (itemInfo.isUnique) {
            targetData.hasStealScroll = false;
            await targetData.save();
            return replyEmbed(message, '#2ecc71', `✅ Đã thu hồi **${itemInfo.name}** của **${targetUser.username}**.`);
        }

        const quantity = parseInt(qtyStr);
        if (isNaN(quantity) || quantity <= 0) return replyEmbed(message, '#e67e22', '⚠️ Số lượng không hợp lệ!');

        targetData[itemInfo.key] = Math.max(0, (targetData[itemInfo.key] || 0) - quantity);
        await targetData.save();

        return replyEmbed(message, '#2ecc71', `✅ Đã thu hồi **${quantity}x ${itemInfo.name}** từ **${targetUser.username}**.`);
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
                `• \`.earnmoney [0-99%]\` - Kiếm tiền (thêm % để chọn rủi ro)\n` +
                `• \`.steal [@user]\` - Ăn trộm tiền (+1.5% mặt nạ / +2% bí kíp)\n` +
                `• \`.doubleornothing\` / \`.don <số tiền>\` - Gấp đôi hoặc mất trắng\n` +
                `• \`.deposit [số tiền/all]\` - Gửi tiền vào ngân hàng\n` +
                `• \`.withdraw [số tiền/all]\` - Rút tiền từ ngân hàng\n` +
                `• \`.givemoney [@user] [số tiền]\` - Chuyển khoản tiền\n\n` +
                `**🛒 Cửa hàng & Balo:**\n` +
                `• \`.itemshop\` - Xem Item Shop (Cửa hàng vật phẩm)\n` +
                `• \`.buy <1-5> [số lượng/all]\` - Mua vật phẩm trong Shop\n` +
                `• \`.usepoint <1-3> [số lượng/all]\` - Dùng nước may mắn\n` +
                `• \`.givepoint @user <1-4> <số lượng>\` - Tặng vật phẩm cho người khác\n` +
                `• \`.backpack\` - Xem túi đồ & hiệu ứng buff\n` +
                `• \`.upgradebackpack\` / \`.ubp\` - Nâng cấp sức chứa Balo\n\n` +
                `**🛠️ Lệnh Quản Lý Vật Phẩm Admin:**\n` +
                `• \`.addpoint @user <1-5> <số lượng>\` - Cấp vật phẩm\n` +
                `• \`.removepoint @user <1-5> <số lượng>\` - Thu hồi vật phẩm\n\n` +
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
