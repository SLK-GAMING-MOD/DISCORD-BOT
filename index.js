const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
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
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff3333')
                .setTitle('❌ Thất Bại')
                .setDescription('Chỉ Admin mới được dùng lệnh này nha bro!');
            return message.reply({ embeds: [errorEmbed] });
        }
        
        // Kiểm tra cú pháp
        if (args.length < 3) {
            const syntaxEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle('⚠️ Sai cú pháp')
                .setDescription('Ví dụ chuẩn: `.newcommand .hello Chào cậu`');
            return message.reply({ embeds: [syntaxEmbed] });
        }

        const newCmd = args[1].toLowerCase();
        const response = args.slice(2).join(' '); // Gộp phần còn lại thành câu trả lời

        // Lưu vào bộ nhớ và ghi vào file
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

    // 3. Lệnh Help xem danh sách
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

    // 2. Chạy lệnh custom (Dành cho tất cả mọi người)
    const userMessage = message.content.toLowerCase();
    if (customCommands[userMessage]) {
        // Tạo giao diện Embed chuẩn giống hệt ảnh bạn yêu cầu
        const resultEmbed = new EmbedBuilder()
            .setColor('#2ecc71') // Thanh màu xanh lá bên cạnh
            .setTitle('Bypass Successful') // Tiêu đề chính giống ảnh
            .addFields({ name: 'Result', value: customCommands[userMessage] }) // Ô chứa Script/Key để copy
            .setFooter({ 
                text: `Requested by ${message.author.username}`, 
                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
            }); // Hiện tên và avatar người gọi lệnh ở góc dưới
        
        return message.reply({ embeds: [resultEmbed] });
    }
});

// Bot sử dụng token từ Environment Variables của web host
client.login(process.env.TOKEN);
