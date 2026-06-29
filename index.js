const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Khởi tạo bot với quyền đọc tin nhắn
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Đường dẫn tới file chứa lệnh trên GitHub/Host
const commandsFilePath = path.join(__dirname, 'commands.json');
let customCommands = {};

// Hàm tải các command từ file
function loadCommands() {
    if (fs.existsSync(commandsFilePath)) {
        const rawData = fs.readFileSync(commandsFilePath, 'utf8');
        customCommands = JSON.parse(rawData);
    }
}

// Chạy hàm tải command khi bot khởi động
loadCommands();

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} đã online!`);
});

client.on('messageCreate', message => {
    // Bỏ qua tin nhắn từ bot khác để tránh loop
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // 1. Lệnh tạo command mới (Chỉ Admin)
    if (command === '.newcommand') {
        // Kiểm tra quyền Admin
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Chỉ Admin mới được dùng lệnh này nha bro!');
        }
        
        // Kiểm tra cú pháp
        if (args.length < 3) {
            return message.reply('⚠️ Sai cú pháp! Ví dụ: `.newcommand .hello Chào cậu`');
        }

        const newCmd = args[1].toLowerCase();
        const response = args.slice(2).join(' '); // Gộp phần còn lại thành câu trả lời

        // Lưu vào bộ nhớ và ghi vào file
        customCommands[newCmd] = response;
        fs.writeFileSync(commandsFilePath, JSON.stringify(customCommands, null, 2));
        return message.reply(`✅ Đã tạo lệnh **${newCmd}** thành công!`);
    }

    // 4. Lệnh xóa command (Chỉ Admin)
    if (command === '.removecommand') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Chỉ Admin mới được dùng lệnh này!');
        }

        const targetCmd = args[1]?.toLowerCase();
        if (customCommands[targetCmd]) {
            delete customCommands[targetCmd];
            fs.writeFileSync(commandsFilePath, JSON.stringify(customCommands, null, 2));
            return message.reply(`✅ Đã xóa lệnh **${targetCmd}**!`);
        } else {
            return message.reply('⚠️ Không tìm thấy lệnh này.');
        }
    }

    // 3. Lệnh Help xem danh sách
    if (command === '.help') {
        const cmds = Object.keys(customCommands);
        if (cmds.length === 0) return message.reply('Hiện tại chưa có lệnh custom nào.');
        return message.reply(`**📜 Danh sách lệnh hiện có:**\n${cmds.join(', ')}`);
    }

    // 2. Chạy lệnh custom (Bất kỳ ai cũng dùng được)
    // So sánh toàn bộ nội dung tin nhắn để gõ ".test" là ra "hi!"
    const userMessage = message.content.toLowerCase();
    if (customCommands[userMessage]) {
        return message.reply(customCommands[userMessage]);
    }
});

// Bot sử dụng token từ Environment Variables của web host
client.login(process.env.TOKEN);
