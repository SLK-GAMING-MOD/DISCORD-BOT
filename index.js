const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
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

// ==========================================
// HỆ THỐNG DATABASE (MONGODB)
// ==========================================

const mongoURI = process.env.MONGO_URI || "mongodb+srv://discordbot:<db_password>@cluster0.qmixkxr.mongodb.net/?appName=Cluster0";

mongoose.connect(mongoURI)
    .then(() => console.log('☁️ Đã kết nối thành công với Database MongoDB!'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// Bảng dữ liệu tiền, ngân hàng, đồ đạc, buff may mắn
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    money: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    lastInterestUpdate: { type: Date, default: Date.now },
    luck1: { type: Number, default: 0 }, // Số lượng bình may mắn [I]
    luck2: { type: Number, default: 0 }, // Số lượng bình may mắn [II]
    luck3: { type: Number, default: 0 }, // Số lượng bình may mắn [III]
    luckBuff: { type: Number, default: 0 }, // % may mắn đang cộng thêm
    luckExpiry: { type: Date, default: null } // Thời gian hết hạn buff
});
const UserMoney = mongoose.model('UserMoney', userSchema);

const commandSchema = new mongoose.Schema({
    cmdName: { type: String, required: true, unique: true },
    response: { type: String, required: true }
});
const CustomCmd = mongoose.model('CustomCmd', commandSchema);

let customCommands = {};

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
                    console.log(`⬆️ Đã đồng bộ lệnh gốc lên mây: ${cmdName}`);
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

// Hàm tính lãi suất ngân hàng tự động (1.5% mỗi 30 phút)
async function applyInterest(userData) {
    if (userData.bank > 0) {
        const now = Date.now();
        const diffMs = now - userData.lastInterestUpdate.getTime();
        const intervals = Math.floor(diffMs / (30 * 60 * 1000));
        
        if (intervals > 0) {
            // Tính lãi suất kép
            userData.bank = Math.floor(userData.bank * Math.pow(1.015, intervals));
            const remainder = diffMs % (30 * 60 * 1000); // Giữ lại phần thời gian dư
            userData.lastInterestUpdate = new Date(now - remainder);
            await userData.save();
        }
    } else {
        userData.lastInterestUpdate = new Date(); // Reset mốc nếu không có tiền trong bank
    }
}

function formatVND(amount) {
    return amount.toLocaleString('vi-VN') + ' VNĐ';
}

client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} đã online!`);
    await loadCommands();
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userId = message.author.id;

    // ==========================================
    // CÁC LỆNH VỀ KINH TẾ (ECONOMY)
    // ==========================================

    if (command === '.money') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = await getUserMoney(targetUser.id);
        
        await applyInterest(targetData); // Tính lãi ngân hàng trước khi hiển thị

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
        if (!amountStr) return message.reply("⚠️ Sai cú pháp! Dùng: `.deposit <số tiền>` hoặc `.deposit all`");
        
        const userData = await getUserMoney(userId);
        if (userData.money <= 0) return message.reply("❌ Bạn đang nợ nần hoặc sạch túi, lấy gì mà gửi ngân hàng?");
        
        await applyInterest(userData); 
        
        let amount = amountStr.toLowerCase() === 'all' ? userData.money : parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > userData.money) return message.reply("⚠️ Số tiền gửi không hợp lệ hoặc lớn hơn tiền mặt bạn đang có!");
        
        userData.money -= amount;
        userData.bank += amount;
        await userData.save();
        return message.reply(`🏦 Giao dịch thành công!\nBạn đã gửi **${formatVND(amount)}** vào ngân hàng. Lãi suất: **+1.5% mỗi 30 phút**.`);
    }

    if (command === '.withdraw') {
        const amountStr = args[1];
        if (!amountStr) return message.reply("⚠️ Sai cú pháp! Dùng: `.withdraw <số tiền>` hoặc `.withdraw all`");
        
        const userData = await getUserMoney(userId);
        
        // ĐÃ SỬA: Cập nhật lãi suất trước rồi check số dư trong tài khoản bank chứ không check nợ tiền mặt nữa
        await applyInterest(userData);
        
        let amount = amountStr.toLowerCase() === 'all' ? userData.bank : parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > userData.bank) return message.reply("⚠️ Số dư trong ngân hàng của bạn không đủ hoặc lệnh rút không hợp lệ!");
        
        userData.bank -= amount;
        userData.money += amount;
        await userData.save();
        return message.reply(`🏦 Giao dịch thành công!\nBạn đã rút **${formatVND(amount)}** từ két ngân hàng ra ví tiền mặt.`);
    }

    if (command === '.steal') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply("⚠️ Bạn phải tag người muốn trộm! Ví dụ: `.steal @ai_đó`");
        if (targetUser.id === userId) return message.reply("⚠️ Sao lại tự móc túi bản thân vậy bro?");

        const attacker = await getUserMoney(userId);
        const target = await getUserMoney(targetUser.id);

        const isSuccess = Math.random() < 0.015; // 1.5% tỷ lệ thành công

        if (isSuccess) {
            if (target.money <= 0) {
                return message.reply(`🕵️ Trộm thành công! Nhưng bạn phát hiện ra **${targetUser.username}** cũng đang cháy túi/nợ nần, chả có đồng nào để lấy!`);
            }
            const stolenAmount = target.money;
            attacker.money += stolenAmount;
            target.money = 0; // Cướp sạch sành sanh
            
            await attacker.save();
            await target.save();
            return message.reply(`🎉 **ĐỈNH CAO ĐẠO CHÍCH!**\nBạn đã luồn lách và vét sạch ví của **${targetUser.username}**.\n💵 Chiếm đoạt: **${formatVND(stolenAmount)}**`);
        } else {
            // ĐÃ UPDATE: Thất bại sẽ quét kiểm tra cả tiền mặt lẫn tài khoản ngân hàng
            await applyInterest(attacker); // Đồng bộ tiền lãi ngân hàng trước khi phạt

            if (attacker.money > 0) {
                const penalty = Math.floor(attacker.money / 2); // Mất 50% tiền mặt
                attacker.money -= penalty;
                await attacker.save();
                return message.reply(`🚨 **BỊ BẮT QUẢ TANG!**\nBạn ăn trộm thất bại và bị cảnh sát tóm cổ.\n💸 Hình phạt: **-${formatVND(penalty)}** (Trừ 50% tiền mặt).`);
            } else if (attacker.bank > 0) {
                const penalty = Math.floor(attacker.bank / 2); // Tiền mặt âm/bằng 0 thì phạt 50% tiền ngân hàng
                attacker.bank -= penalty;
                await attacker.save();
                return message.reply(`🚨 **BỊ BẮT QUẢ TANG!**\nBạn ăn trộm thất bại! Tiền mặt không có xu nào nên cảnh sát đã trích thu từ tài khoản ngân hàng.\n💸 Hình phạt: **-${formatVND(penalty)}** (Trừ 50% tiền ngân hàng).`);
            } else {
                return message.reply(`🚨 **BỊ BẮT QUẢ TANG!**\nBạn ăn trộm thất bại! Nhưng vì cả ví tiền mặt lẫn tài khoản ngân hàng của bạn đều trống rỗng (hoặc âm), cảnh sát đành bất lực cảnh cáo rồi thả đi.`);
            }
        }
    }

    if (command === '.luckyshop') {
        const shopEmbed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('🛒 Cửa Hàng May Mắn')
            .setDescription('Tăng tỷ lệ thắng khi gõ lệnh `.earnmoney`! Các bình tác dụng trong **5 phút** và **cộng dồn** với nhau!\n\n' +
                '🧪 **1. Lucky Point [I]** - `100,000 VNĐ` *(+5% tỷ lệ thắng)*\n' +
                '🧪 **2. Lucky Point [II]** - `300,000 VNĐ` *(+20% tỷ lệ thắng)*\n' +
                '🧪 **3. Lucky Point [III]** - `500,000 VNĐ` *(+35% tỷ lệ thắng)*\n\n' +
                '🔹 **Cách mua:** `.buy <1/2/3>`\n' +
                '🔹 **Xem túi:** `.backpack`\n' +
                '🔹 **Sử dụng:** `.usepoint <1/2/3>`')
            .setFooter({ text: 'Lưu ý: Không hỗ trợ bán cho người đang bị âm tiền!' });
        return message.reply({ embeds: [shopEmbed] });
    }

    if (command === '.buy') {
        const item = args[1];
        if (!['1', '2', '3'].includes(item)) return message.reply("⚠️ Món này không bán! Nhập `.buy 1`, `.buy 2`, hoặc `.buy 3`.");
        
        const userData = await getUserMoney(userId);
        if (userData.money < 0) return message.reply("❌ Cửa hàng không nhận tiền âm. Hãy đi cày trả nợ trước đi!");

        let price = 0, itemName = "";
        if (item === '1') { price = 100000; itemName = "Lucky Point [I]"; }
        if (item === '2') { price = 300000; itemName = "Lucky Point [II]"; }
        if (item === '3') { price = 500000; itemName = "Lucky Point [III]"; }

        if (userData.money < price) return message.reply(`❌ Thiếu tiền gòi bro! Cần **${formatVND(price)}** để rước ${itemName} về.`);

        userData.money -= price;
        if (item === '1') userData.luck1 += 1;
        if (item === '2') userData.luck2 += 1;
        if (item === '3') userData.luck3 += 1;
        await userData.save();

        return message.reply(`✅ Giao dịch thành công! Đã thêm **1x ${itemName}** vào balo.\nDùng \`.backpack\` để xem.`);
    }

    if (command === '.backpack') {
        const userData = await getUserMoney(userId);
        
        let buffStatus = "Không có";
        if (userData.luckExpiry && userData.luckExpiry > Date.now()) {
            const timeLeft = Math.floor((userData.luckExpiry.getTime() - Date.now()) / 1000);
            buffStatus = `**+${userData.luckBuff}% may mắn** (Còn ${Math.floor(timeLeft/60)} phút ${timeLeft%60} giây)`;
        }

        const bpEmbed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('🎒 Balo Của Bạn')
            .setDescription(`✨ **Buff Kích Hoạt:** ${buffStatus}\n\n` +
                `**Vật phẩm đang có:**\n` +
                `🧪 **Lucky Point [I]:** ${userData.luck1} bình\n` +
                `🧪 **Lucky Point [II]:** ${userData.luck2} bình\n` +
                `🧪 **Lucky Point [III]:** ${userData.luck3} bình\n\n` +
                `Mở nút dùng: \`.usepoint <1/2/3>\``);
        return message.reply({ embeds: [bpEmbed] });
    }

    if (command === '.usepoint') {
        const item = args[1];
        if (!['1', '2', '3'].includes(item)) return message.reply("⚠️ Sai cú pháp! Dùng `.usepoint 1`, `.usepoint 2`, hoặc `.usepoint 3`.");
        
        const userData = await getUserMoney(userId);
        
        if (item === '1' && userData.luck1 <= 0) return message.reply("❌ Balo hết Lucky Point [I] rồi!");
        if (item === '2' && userData.luck2 <= 0) return message.reply("❌ Balo hết Lucky Point [II] rồi!");
        if (item === '3' && userData.luck3 <= 0) return message.reply("❌ Balo hết Lucky Point [III] rồi!");
        
        if (item === '1') userData.luck1 -= 1;
        if (item === '2') userData.luck2 -= 1;
        if (item === '3') userData.luck3 -= 1;

        let buffAmount = 0;
        if (item === '1') buffAmount = 5;
        if (item === '2') buffAmount = 20;
        if (item === '3') buffAmount = 35;

        // Cộng dồn buff nếu còn hiệu lực, nếu không thì reset buff về chỉ số mới
        if (!userData.luckExpiry || userData.luckExpiry <= Date.now()) {
            userData.luckBuff = buffAmount;
        } else {
            userData.luckBuff += buffAmount;
        }
        
        // Reset thời gian chạy 5 phút từ lúc uống
        userData.luckExpiry = new Date(Date.now() + 5 * 60 * 1000);
        await userData.save();

        return message.reply(`🧪 Ực ực... Bạn cảm thấy vô cùng may mắn!\nHiệu ứng: **+${buffAmount}%** vào tỷ lệ kiếm tiền. (Tổng may mắn: **+${userData.luckBuff}%**, duy trì 5 phút).`);
    }

    if (command === '.earnmoney') {
        let risk = 0; 
        if (args[1]) {
            risk = parseInt(args[1].replace('%', ''));
            if (isNaN(risk) || risk < 0) risk = 0;
            if (risk > 99) risk = 99; 
        }

        const pendingMsg = await message.reply('⏳ Bot đang đi kiếm tiền cho bạn, chờ 3 giây nhé...');

        setTimeout(async () => {
            const userData = await getUserMoney(userId); 
            
            // Tỷ lệ thắng mặc định
            let winChance = 100 - risk; 

            // Áp dụng bùa may mắn
            let activeBuff = 0;
            if (userData.luckExpiry && userData.luckExpiry > Date.now()) {
                activeBuff = userData.luckBuff;
                winChance += activeBuff; 
            } else if (userData.luckExpiry && userData.luckExpiry <= Date.now() && userData.luckBuff > 0) {
                // Hết hạn buff
                userData.luckBuff = 0; 
            }

            // Random từ 1-100, nếu nhỏ hơn hoặc bằng winChance thì thắng
            const isWin = (Math.random() * 100) <= winChance; 
            let resultEmbed = new EmbedBuilder();

            if (isWin) {
                const minWin = 100 + (risk * 1000); 
                const maxWin = 1000 + (risk * 3000); 
                const earned = Math.floor(Math.random() * (maxWin - minWin + 1)) + minWin;

                userData.money += earned;
                await userData.save(); 

                let winDesc = `Bạn mạo hiểm **${risk}%** và thắng đậm!\n\n💸 Nhận: **+${formatVND(earned)}**\n💰 Tiền mặt hiện tại: **${formatVND(userData.money)}**`;
                if (activeBuff > 0) winDesc += `\n✨ *(Nhờ có +${activeBuff}% may mắn độ trì!)*`;

                resultEmbed.setColor('#2ecc71')
                    .setTitle('🎉 Chúc Mừng!')
                    .setDescription(winDesc);
            } else {
                const minLose = 500 + (risk * 500);
                const maxLose = 1000 + (risk * 2000);
                let lost = Math.floor(Math.random() * (maxLose - minLose + 1)) + minLose;

                userData.money -= lost; 
                await userData.save(); 

                let loseDesc = `Mạo hiểm **${risk}%** nhưng dẫm nhầm mìn, toang rồi!\n\n💸 Bị trừ: **-${formatVND(lost)}**\n💰 Tiền mặt hiện tại: **${formatVND(userData.money)}**`;
                if (activeBuff > 0) loseDesc += `\n😭 *(Dù đã cắn bình +${activeBuff}% may mắn nhưng vẫn quá đen!)*`;

                resultEmbed.setColor('#e74c3c')
                    .setTitle('😭 Toang Rồi!')
                    .setDescription(loseDesc);
            }

            pendingMsg.edit({ content: '', embeds: [resultEmbed] });
        }, 3000);
        return;
    }

    if (command === '.addmoney') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ Chỉ Admin mới có quyền "in tiền"!');
        const targetUser = message.mentions.users.first();
        const amountStr = args[2];
        if (!targetUser || !amountStr) return message.reply('⚠️ Sai cú pháp! Ví dụ: `.addmoney @user 1000000`');

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Số tiền không hợp lệ!');

        const targetData = await getUserMoney(targetUser.id);
        targetData.money += amount;
        await targetData.save();
        return message.reply(`✅ Đã bơm **${formatVND(amount)}** vào tài khoản của **${targetUser.username}**.`);
    }

    if (command === '.removemoney') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ Chỉ Admin mới có quyền thu hồi tiền!');
        const targetUser = message.mentions.users.first();
        const amountStr = args[2];
        if (!targetUser || !amountStr) return message.reply('⚠️ Sai cú pháp! Ví dụ: `.removemoney @user 50000`');

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Số tiền không hợp lệ!');

        const targetData = await getUserMoney(targetUser.id);
        targetData.money -= amount; 
        await targetData.save();
        return message.reply(`✅ Đã thu hồi **${formatVND(amount)}** từ tài khoản của **${targetUser.username}**.`);
    }

    if (command === '.givemoney') {
        const targetUser = message.mentions.users.first();
        const amountStr = args[2];
        if (!targetUser || !amountStr) return message.reply('⚠️ Sai cú pháp! Ví dụ: `.givemoney @user 50000`');
        if (targetUser.id === message.author.id) return message.reply('⚠️ Không thể tự chuyển cho chính mình!');

        const amount = parseInt(amountStr.replace(/[,.]/g, ''));
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Số tiền không hợp lệ!');

        const senderData = await getUserMoney(userId);
        if (senderData.money < amount) return message.reply(`❌ Bạn không đủ tiền! Số dư của bạn: **${formatVND(senderData.money)}**`);

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
        
        customCommands[newCmd] = response;
        
        await CustomCmd.findOneAndUpdate({ cmdName: newCmd }, { response: response }, { upsert: true, new: true });
        const successEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Hệ Thống Lệnh').setDescription(`Đã tạo/cập nhật lệnh **${newCmd}** thành công!`);
        return message.reply({ embeds: [successEmbed] });
    }

    if (command === '.removecommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply('❌ Chỉ Admin mới được dùng lệnh này!');
        const targetCmd = args[1]?.toLowerCase();
        
        if (customCommands[targetCmd]) {
            delete customCommands[targetCmd];
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
            .setDescription(
                `**🏦 Kinh tế & Ngân hàng:**\n` +
                `• \`.money [@user]\` - Xem ví & sổ tiết kiệm\n` +
                `• \`.earnmoney [0-99%]\` - Kiếm tiền (thêm % để tự chọn rủi ro)\n` +
                `• \`.steal [@user]\` - Ăn trộm tiền\n` +
                `• \`.deposit [số tiền/all]\` - Gửi tiền vào ngân hàng (lãi 1.5%/30p)\n` +
                `• \`.withdraw [số tiền/all]\` - Rút tiền từ ngân hàng\n` +
                `• \`.givemoney [@user] [số tiền]\` - Chuyển khoản\n\n` +
                `**🛒 Cửa hàng May Mắn:**\n` +
                `• \`.luckyshop\` - Xem gian hàng may mắn\n` +
                `• \`.buy <1/2/3>\` - Mua bình may mắn\n` +
                `• \`.backpack\` - Xem túi đồ\n` +
                `• \`.usepoint <1/2/3>\` - Dùng đồ tăng % thắng\n\n` +
                `**⚙️ Lệnh Admin:**\n` +
                `• \`.addmoney\`, \`.removemoney\`, \`.newcommand\`, \`.removecommand\`\n\n` +
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
