// ====================================================================
// 1. КОНСТАНТЫ
// ====================================================================
const BOT_TOKEN = 'ваш_апи_тг_бота';
const ADMIN_ID = '6063275553';
const CHANNEL_ID = '-1003719104436';
const GROQ_API_KEY = 'Ваш_апи_грока';

// ЖЕСТКО ЗАДАННЫЙ URL РАЗВЕРТЫВАНИЯ (ИСПОЛЬЗУЕМ /exec)
const EXEC_URL = 'https://script.google.com/macros/s/AKfycbwM43PJ6vRF9aoRpayW4nISBB7TWyrrWSVDxQEjqM63ZBxL3ibpoVKihq7xroCM16jL6Q/exec';

const PENDING_PREFIX = 'PENDING_';
const TARGET_HOURS = [8, 10, 12, 14, 16];

// ====================================================================
// 2. УТИЛИТЫ И ОЧИСТКА
// ====================================================================
function cleanTextForPost(text) {
  if (!text) return '';
  text = String(text)
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\[\s*Публикуется с сохранением.*?\]/gi, '');
  text = text.replace(/\(Источник:.*?\)/gi, '');
  text = text.replace(/ссылка на источник.*$/gim, '');
  text = text.replace(/\s+([,.!?;:'"])/g, '$1');
  text = text.replace(/(['"])\s+/g, '$1');
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/  +/g, ' ').trim();
  
  var lines = text.split('\n');
  if (lines.length > 2) {
    var lastLine = lines[lines.length - 1].trim();
    var firstLine = lines[0].trim();
    if (lastLine.length < 35 && firstLine.toLowerCase().includes(lastLine.toLowerCase())) {
      lines.pop();
      text = lines.join('\n').trim();
    }
  }
  return text;
}

function extractEssence(text, isMeme) {
  if (!text) return '';
  if (isMeme) return cleanTextForPost(text);
  var cleanText = cleanTextForPost(text);
  if (cleanText.length < 150) return formatAsList(cleanText);

  try {
    var payload = {
      model: "qwen/qwen3.8-27b",
      messages: [
        {
          role: "system",
          content: "Ты — редактор Telegram-канала по Dota 2. Преврати текст в 2-3 коротких абзаца.\nПРАВИЛА:\n1. Запрещены повторы.\n2. Игнорируй мусор в конце.\n3. Выделяй имена игроков, команд и ключевые факты используя HTML теги: <b>текст</b>.\n4. Пиши динамично.\n5. Отвечай ТОЛЬКО готовым текстом."
        },
        { role: "user", content: cleanText.substring(0, 2500) }
      ],
      temperature: 0.4,
      max_tokens: 350
    };

    var response = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 15000
    });

    var result = JSON.parse(response.getContentText());
    if (result.error) throw new Error(result.error.message);
    
    if (result.choices && result.choices.length > 0) {
      var summary = result.choices[0].message.content.trim();
      return summary.replace(/\n{3,}/g, '\n\n').replace(/^\s*-\s/gm, '• ').trim();
    }
    throw new Error("Пустой ответ");
  } catch (e) {
    console.log("⚠️ ИИ недоступен: " + e.toString());
    return formatAsList(cleanText);
  }
}

function formatAsList(text) {
  var paragraphs = text.split('\n\n');
  var essence = [];
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i].trim();
    if (p.length > 40) {
      if (!p.startsWith('•') && !p.startsWith('—')) p = '• ' + p;
      essence.push(p);
    }
    if (essence.length >= 3) break;
  }
  return essence.length > 0 ? essence.join('\n\n') : text.substring(0, 300) + '...';
}

function formatPostText(title, text) {
  var cleanTitle = String(title).replace(/\s+/g, ' ').trim();
  var safeTitle = escapeHtml(cleanTitle);
  text = addSpaceAfterBoldBeforeNumber(text);
  return "<b>" + safeTitle + "</b>\n\n" + text;
}

function addSpaceAfterBoldBeforeNumber(text) {
  if (!text) return '';
  text = text.replace(/<\/b>(\d)/gi, '</b> $1');
  text = text.replace(/<b>(\d+)\.([А-ЯA-Zа-яa-z])/gi, '<b>$1. $2');
  return text;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isRecent(pubDateStr, maxHours) {
  try {
    var pubDate = new Date(pubDateStr);
    var diffHours = (new Date() - pubDate) / (1000 * 60 * 60);
    return diffHours <= maxHours;
  } catch (e) { return true; }
}

function isQualityContent(text, url, sourceName) {
  if (!text) return false;
  var lowerText = text.toLowerCase();
  var lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('stream') || lowerUrl.includes('prediction') || lowerUrl.includes('forecast') || lowerUrl.includes('giveaway') || lowerUrl.includes('rozigrish') || lowerUrl.includes('promo')) return false;
  var bettingPatterns = [/фора\s*\(?[-+]?\d+\.?\d*\)?/i, /тотал\s*(больше|меньше)\s*\d+\.?\d*/i, /п1:\s*\d+\.\d+.*п2:\s*\d+\.\d+/i];
  var bettingMatches = 0;
  bettingPatterns.forEach(function(regex) { if (regex.test(lowerText)) bettingMatches++; });
  if (bettingMatches >= 2) return false;
  var isMemeSource = sourceName.includes('Reddit') || sourceName.includes('Pikabu');
  if (isMemeSource) {
    if (lowerText.includes('промокод') || lowerText.includes('бонус за регистрацию') || lowerText.includes('1xbet')) return false;
    return true;
  } else {
    if (text.length < 100) return false;
    var digitsCount = (text.match(/\d/g) || []).length;
    var lettersCount = (text.match(/[а-яa-z]/gi) || []).length;
    if (lettersCount > 0 && (digitsCount / lettersCount) > 0.20) return false;
    return true;
  }
}

function apiRequest(method, payload) {
  var url = "https://api.telegram.org/bot" + BOT_TOKEN + "/" + method;
  var response = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  return JSON.parse(response.getContentText());
}

function sendMessage(chatId, text) {
  apiRequest("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" });
}

function answerCallback(id, text) {
  apiRequest("answerCallbackQuery", { callback_query_id: id, text: text, show_alert: false });
}

// ====================================================================
// 3. ВЕБХУК И ОБРАБОТКА
// ====================================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.getDataAsString) {
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }
    var update = JSON.parse(e.postData.getDataAsString());
    if (update.callback_query) processButton(update.callback_query);
    else if (update.message && update.message.text) processMessage(update.message);
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  }
}

function processButton(cb) {
  if (String(cb.from.id) !== ADMIN_ID) return;
  var parts = cb.data.split(":");
  var action = parts[0], id = parts[1];
  var key = PENDING_PREFIX + id;
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty(key);
  if (!saved) { answerCallback(cb.id, "Уже обработано"); return; }
  var article = JSON.parse(saved);
  
  if (action === "rej") {
    props.deleteProperty(key);
    answerCallback(cb.id, "Отклонено");
  } else if (action === "edt") {
    props.setProperty("CURRENT_EDIT_ID", id);
    props.setProperty("EDIT_STEP", "TITLE");
    answerCallback(cb.id, "Режим редактирования");
    sendMessage(ADMIN_ID, "ЭТАП 1/2: Напишите НОВЫЙ ЗАГОЛОВОК.\n(Отправьте '-', чтобы оставить старый):\n\n" + article.title);
  } else if (action === "pub") {
    var fullCaption = formatPostText(article.title, article.text);
    var shortCaption = fullCaption.length > 1000 ? fullCaption.substring(0, 990) + "\n\n..." : fullCaption;
    var result, mediaSent = false;
    
    // Поддержка как строки, так и массива ссылок
    var mediaUrls = Array.isArray(article.image) ? article.image : (article.image ? [article.image] : []);
    
    if (mediaUrls.length > 0) {
      var botUrl = "https://api.telegram.org/bot" + BOT_TOKEN;
      
      // Если картинок несколько и это не видео — отправляем альбомом в канал
      if (mediaUrls.length > 1 && article.mediaType !== 'video') {
        console.log("Отправляем альбом в канал: " + mediaUrls.length + " фото");
        var payload = { chat_id: CHANNEL_ID };
        var mediaArray = [];

        for (var i = 0; i < mediaUrls.length; i++) {
          var mUrl = mediaUrls[i];
          if (mUrl.startsWith("//")) mUrl = "https:" + mUrl;
          else if (mUrl.startsWith("/") && !mUrl.startsWith("//")) {
             var domain = article.link.match(/https?:\/\/[^\/]+/);
             if (domain) mUrl = domain[0] + mUrl;
          }

          var mediaResponse = UrlFetchApp.fetch(mUrl, {muteHttpExceptions: true, timeout: 30000});
          if (mediaResponse.getResponseCode() === 200) {
            var blob = mediaResponse.getBlob();
            var attachName = "photo" + i;

            mediaArray.push({
              type: "photo",
              media: "attach://" + attachName,
              caption: i === 0 ? shortCaption : undefined,
              parse_mode: i === 0 ? "HTML" : undefined
            });

            payload[attachName] = blob;
          }
        }

        if (mediaArray.length > 0) {
          payload.media = JSON.stringify(mediaArray);
          var res = UrlFetchApp.fetch(botUrl + "/sendMediaGroup", {
            method: "post",
            payload: payload,
            muteHttpExceptions: true
          });
          result = JSON.parse(res.getContentText());
          if (result && result.ok) mediaSent = true;
        }
      } else {
        // Одиночное фото или видео
        var mediaUrl = mediaUrls[0];
        if (mediaUrl.startsWith("//")) mediaUrl = "https:" + mediaUrl;
        else if (mediaUrl.startsWith("/") && !mediaUrl.startsWith("//")) {
          var domain = article.link.match(/https?:\/\/[^\/]+/);
          if (domain) mediaUrl = domain[0] + mediaUrl;
        }
        
        if (mediaUrl.startsWith("http")) {
          try {
            var mediaResponse = UrlFetchApp.fetch(mediaUrl, {muteHttpExceptions: true, timeout: 30000});
            if (mediaResponse.getResponseCode() === 200) {
              var blob = mediaResponse.getBlob();
              var isVideo = article.mediaType === 'video' || mediaUrl.includes('.mp4') || mediaUrl.includes('v.redd.it');
              
              if (isVideo) {
                console.log("Отправляем видео в канал: " + mediaUrl);
                var res = UrlFetchApp.fetch(botUrl + "/sendVideo", {
                  method: "post", 
                  payload: { chat_id: CHANNEL_ID, video: blob, caption: shortCaption, parse_mode: "HTML", supports_streaming: true }, 
                  muteHttpExceptions: true
                });
                result = JSON.parse(res.getContentText());
                if (result && result.ok) mediaSent = true;
              } else {
                console.log("Отправляем фото в канал: " + mediaUrl);
                var res = UrlFetchApp.fetch(botUrl + "/sendPhoto", {
                  method: "post", 
                  payload: { chat_id: CHANNEL_ID, photo: blob, caption: shortCaption, parse_mode: "HTML" }, 
                  muteHttpExceptions: true
                });
                result = JSON.parse(res.getContentText());
                if (result && result.ok) mediaSent = true;
              }
            }
          } catch (e) { 
            console.log("Не удалось скачать медиа: " + e);
          }
        }
      }
    }
    
    if (!mediaSent) {
      result = apiRequest("sendMessage", { 
        chat_id: CHANNEL_ID, 
        text: fullCaption, 
        parse_mode: "HTML",
        disable_web_page_preview: true 
      });
    }
    
    if (result && result.ok) {
      props.deleteProperty(key);
      answerCallback(cb.id, "Опубликовано");
      sendMessage(ADMIN_ID, mediaSent ? "Опубликовано с медиа" : "Опубликовано текстом");
    } else {
      answerCallback(cb.id, "Ошибка");
      sendMessage(ADMIN_ID, "ОШИБКА: " + JSON.stringify(result));
    }
  }
}

function processMessage(msg) {
  if (String(msg.from.id) !== ADMIN_ID) return;
  var props = PropertiesService.getScriptProperties();
  var editId = props.getProperty("CURRENT_EDIT_ID");
  var step = props.getProperty("EDIT_STEP");
  if (editId && step) {
    var key = PENDING_PREFIX + editId;
    var saved = props.getProperty(key);
    if (saved) {
      var article = JSON.parse(saved);
      var inputText = msg.text;
      if (step === "TITLE") {
        if (inputText.trim() !== "-") article.title = inputText;
        props.setProperty("EDIT_STEP", "TEXT");
        sendMessage(ADMIN_ID, "Заголовок принят.\n\nЭТАП 2/2: Напишите НОВЫЙ ТЕКСТ.\n(Отправьте '-', чтобы оставить старый)");
      } else if (step === "TEXT") {
        if (inputText.trim() !== "-") article.text = inputText;
        props.setProperty(key, JSON.stringify(article));
        props.deleteProperty("CURRENT_EDIT_ID");
        props.deleteProperty("EDIT_STEP");
        sendMessage(ADMIN_ID, "Готово. Теперь нажмите 'Опубликовать' в исходном сообщении.");
      }
    }
  }
}

// ====================================================================
// 4. ПАРСИНГ ИСТОЧНИКОВ
// ====================================================================
function fetchAndSendNews() {
  console.log("🚀 ЗАПУСК С ПОДДЕРЖКОЙ АЛЬБОМОВ");
  var totalSent = 0, props = PropertiesService.getScriptProperties();
  
  var MAX_TOTAL = 10;
  var MAX_PER_SOURCE = 3;
  
  var sources = [
    { url: 'https://cyber.sports.ru/rss/topnews.xml', name: 'Cyber.Sports.ru' },
    { url: 'https://dota2.ru/news/rss/', name: 'Dota2.ru' }
  ];
  var blacklist = ['трансляция', 'стрим', 'ставка', 'коэффициент', 'букмекер', '18+', 'реклама', 'казино', 'прогноз', 'giveaway', 'розыгрыш'];

  // ==========================================
  // 1. PIKABU
  // ==========================================
  var pikabuSent = 0;
  if (totalSent < MAX_TOTAL && pikabuSent < MAX_PER_SOURCE) {
    console.log("📊 === ПАРСИНГ PIKABU ===");
    try {
      var pikabuRes = UrlFetchApp.fetch("https://pikabu.ru/tag/dota2", {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      
      if (pikabuRes.getResponseCode() !== 200) {
        console.log("⚠️ Pikabu код: " + pikabuRes.getResponseCode());
      } else {
        var html = pikabuRes.getContentText('windows-1251');
        var storyMatches = html.match(/<article[^>]*class="[^"]*story[^"]*"[^>]*>[\s\S]*?<\/article>/gi);
        
        if (!storyMatches || storyMatches.length === 0) {
          console.log("⚠️ Pikabu не нашел article блоков");
        } else {
          for (var i = 0; i < storyMatches.length; i++) {
            if (totalSent >= MAX_TOTAL || pikabuSent >= MAX_PER_SOURCE) break;
            
            var story = storyMatches[i];
            
            var linkMatch = story.match(/href="([^"]*\/story\/[^"]+)"/i);
            var link = "";
            if (linkMatch) {
              link = linkMatch[1];
              if (link.startsWith('//')) link = 'https:' + link;
              else if (link.startsWith('/')) link = 'https://pikabu.ru' + link;
            }
            
            var titleMatch = story.match(/story__title-link[^>]*>([^<]+)<\/a>/i);
            var title = titleMatch ? titleMatch[1].trim() : "Пост по Dota 2";
            
            if (!link || props.getProperty('SENT_' + link)) continue;
            if (title.length < 5) continue;
            
            // ХИРУРГИЧЕСКИЙ ПОИСК ВСЕХ КАРТИНОК
            var mediaUrls = [];
            var mediaType = 'photo';
            var allImageBlocks = story.match(/<figure[^>]*class="[^"]*story-image[^"]*"[^>]*>[\s\S]*?<\/figure>/gi);
            
            if (allImageBlocks && allImageBlocks.length > 0) {
              for (var k = 0; k < allImageBlocks.length; k++) {
                var block = allImageBlocks[k];
                var imgUrl = null;
                
                var largeImgMatch = block.match(/data-large-image=["']([^"']+)["']/i);
                var dataSrcMatch = block.match(/data-src=["']([^"']+)["']/i);
                var srcMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i);
                
                if (largeImgMatch) imgUrl = largeImgMatch[1];
                else if (dataSrcMatch) imgUrl = dataSrcMatch[1];
                else if (srcMatch) imgUrl = srcMatch[1];
                
                if (imgUrl) {
                  imgUrl = imgUrl.replace(/&amp;/g, '&');
                  if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
                  else if (imgUrl.startsWith('/')) imgUrl = 'https://pikabu.ru' + imgUrl;
                  mediaUrls.push(imgUrl);
                }
              }
            }
            
            if (mediaUrls.length === 0) {
              var videoMatch = story.match(/<video[^>]+(?:src|data-src)=["']([^"']+\.(?:mp4|webm))["']/i);
              if (videoMatch) {
                var videoUrl = videoMatch[1];
                if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;
                mediaUrls.push(videoUrl);
                mediaType = 'video';
              }
            }
            
            if (mediaUrls.length === 0) continue;
            
            var textBlocks = story.match(/<div[^>]*class="[^"]*story-block_type_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
            var cleanText = title;
            if (textBlocks) {
              for (var j = 0; j < Math.min(textBlocks.length, 5); j++) {
                var pMatch = textBlocks[j].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
                if (pMatch) {
                  var pText = pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                  if (pText.length > 20) cleanText += "\n\n" + pText;
                }
              }
            }
            
            var cleanEssence = extractEssence(cleanText, true);
            var article = {
              title: title,
              link: link,
              text: cleanEssence,
              source: "Pikabu (Dota 2)",
              image: mediaUrls, // МАССИВ
              mediaType: mediaType
            };
            var id = Utilities.getUuid().substring(0, 8);
            props.setProperty(PENDING_PREFIX + id, JSON.stringify(article));
            
            sendToModerationWithMedia(article, id, mediaType);
            
            props.setProperty('SENT_' + link, 'true');
            totalSent++;
            pikabuSent++;
            Utilities.sleep(1500);
          }
          console.log("📊 Pikabu итого: " + pikabuSent);
        }
      }
    } catch (e) { console.error("❌ Ошибка Pikabu: " + e); }
  }

  // ==========================================
  // 2. RSS ИСТОЧНИКИ
  // ==========================================
  for (var s = 0; s < sources.length; s++) {
    if (totalSent >= MAX_TOTAL) break;
    var source = sources[s];
    var sourceSent = 0;
    
    try {
      var response = UrlFetchApp.fetch(source.url, { 
        muteHttpExceptions: true, 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
      });
      
      if (response.getResponseCode() !== 200) continue;
      
      var doc = XmlService.parse(response.getContentText());
      var root = doc.getRootElement();
      if (!root) continue;
      
      var items = root.getName() === 'rss' ? root.getChild('channel').getChildren('item') : root.getChildren('entry');
      if (!items || items.length === 0) continue;
      
      for (var i = 0; i < items.length; i++) {
        if (totalSent >= MAX_TOTAL || sourceSent >= MAX_PER_SOURCE) break;
        var item = items[i];
        var title = item.getChild('title') ? item.getChild('title').getText() : "Без заголовка";
        var linkEl = item.getChild('link');
        var link = linkEl ? (linkEl.getAttribute('href') ? linkEl.getAttribute('href').getValue() : linkEl.getText()) : "";
        var descEl = item.getChild('description') || item.getChild('summary') || item.getChild('content');
        var description = descEl ? descEl.getText() : "";
        
        if (!link || props.getProperty('SENT_' + link)) continue;
        if (blacklist.some(word => title.toLowerCase().includes(word)) || title.length < 20) { 
          props.setProperty('SENT_' + link, 'true');
          continue; 
        }
        
        var fullContent = getFullContent(link, description);
        if (!fullContent || !fullContent.text || fullContent.text.length < 10) continue;
        if (!isQualityContent(fullContent.text, link, source.name)) { 
          props.setProperty('SENT_' + link, 'true');
          continue; 
        }
        
        var cleanEssence = extractEssence(fullContent.text, false);
        var article = { title: title, link: link, text: cleanEssence, source: source.name, image: fullContent.image };
        var id = Utilities.getUuid().substring(0, 8);
        props.setProperty(PENDING_PREFIX + id, JSON.stringify(article));
        
        if (fullContent.image) {
          sendToModerationWithMedia(article, id, 'photo');
        } else {
          sendToModerationTextOnly(article, id);
        }
        
        props.setProperty('SENT_' + link, 'true');
        totalSent++;
        sourceSent++;
        Utilities.sleep(1500);
      }
    } catch (e) { console.error("❌ Ошибка " + source.name + ": " + e); }
  }
  
  console.log("🎯 === ИТОГО === Всего отправлено: " + totalSent);
}

// ====================================================================
// 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ МОДЕРАЦИИ
// ====================================================================
function sendToModerationWithMedia(article, id, mediaType) {
  var caption = "<b>Источник: " + article.source + "</b>\n\n<b>" + escapeHtml(article.title) + "</b>\n\n" + article.text + "\n\n<a href=\"" + escapeHtml(article.link) + "\">Ссылка</a>";
  var keyboard = { inline_keyboard: [[{text: 'Опубликовать', callback_data: 'pub:' + id}, {text: 'Отклонить', callback_data: 'rej:' + id}], [{text: 'Редактировать', callback_data: 'edt:' + id}]] };
  
  try {
    var mediaUrls = Array.isArray(article.image) ? article.image : [article.image];
    var botUrl = "https://api.telegram.org/bot" + BOT_TOKEN;
    
    if (mediaUrls.length > 1 && mediaType !== 'video') {
      var payload = { chat_id: ADMIN_ID };
      var mediaArray = [];

      for (var i = 0; i < mediaUrls.length; i++) {
        var mUrl = mediaUrls[i];
        if (mUrl.startsWith("//")) mUrl = "https:" + mUrl;

        var mediaResponse = UrlFetchApp.fetch(mUrl, {muteHttpExceptions: true, timeout: 30000});
        if (mediaResponse.getResponseCode() === 200) {
          var blob = mediaResponse.getBlob();
          var attachName = "photo" + i;

          mediaArray.push({
            type: "photo",
            media: "attach://" + attachName,
            caption: i === 0 ? caption : undefined,
            parse_mode: i === 0 ? "HTML" : undefined
          });
          payload[attachName] = blob;
        }
      }

      if (mediaArray.length > 0) {
        payload.media = JSON.stringify(mediaArray);
        UrlFetchApp.fetch(botUrl + "/sendMediaGroup", {
          method: "post",
          payload: payload,
          muteHttpExceptions: true
        });

        Utilities.sleep(1000);
        apiRequest("sendMessage", {
          chat_id: ADMIN_ID,
          text: "<i>Выберите действие:</i>",
          reply_markup: JSON.stringify(keyboard),
          parse_mode: "HTML"
        });
        return;
      }
    }
    
    var mediaUrl = mediaUrls[0];
    var mediaResponse = UrlFetchApp.fetch(mediaUrl, {muteHttpExceptions: true, timeout: 30000});
    
    if (mediaResponse.getResponseCode() === 200) {
      var blob = mediaResponse.getBlob();
      if (mediaType === 'video' || mediaUrl.includes('.mp4')) {
        UrlFetchApp.fetch(botUrl + "/sendVideo", {
          method: "post", 
          payload: { chat_id: ADMIN_ID, video: blob, caption: caption, parse_mode: "HTML", supports_streaming: true, reply_markup: JSON.stringify(keyboard) }, 
          muteHttpExceptions: true
        });
      } else {
        UrlFetchApp.fetch(botUrl + "/sendPhoto", {
          method: "post", 
          payload: { chat_id: ADMIN_ID, photo: blob, caption: caption, parse_mode: "HTML", reply_markup: JSON.stringify(keyboard) }, 
          muteHttpExceptions: true
        });
      }
    } else {
      sendToModerationTextOnly(article, id);
    }
  } catch (e) {
    sendToModerationTextOnly(article, id);
  }
}

function sendToModerationTextOnly(article, id) {
  var caption = "<b>Источник: " + article.source + "</b>\n\n<b>" + escapeHtml(article.title) + "</b>\n\n" + article.text + "\n\n<a href=\"" + escapeHtml(article.link) + "\">Ссылка</a>";
  var keyboard = { inline_keyboard: [[{text: 'Опубликовать', callback_data: 'pub:' + id}, {text: 'Отклонить', callback_data: 'rej:' + id}], [{text: 'Редактировать', callback_data: 'edt:' + id}]] };
  
  apiRequest("sendMessage", { 
    chat_id: ADMIN_ID, 
    text: caption, 
    reply_markup: JSON.stringify(keyboard), 
    parse_mode: "HTML", 
    disable_web_page_preview: true 
  });
}

function getFullContent(url, rssDescription) {
  try {
    var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }).getContentText();
    var image = null, text = "";
    var ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogMatch) image = ogMatch[1];
    
    if (rssDescription && rssDescription.length > 10) {
      text = rssDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    
    var ps = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (ps) {
      for (var i = 0; i < ps.length; i++) {
        var t = ps[i].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (t.length > 20) text += t + "\n\n";
      }
    }
    if (!text) text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    
    return { image: image, text: text };
  } catch (e) {
    return { image: null, text: "Не удалось загрузить." };
  }
}

// ====================================================================
// 6. АВТОМАТИЗАЦИЯ И УПРАВЛЕНИЕ ВЕБХУКОМ
// ====================================================================
function scheduledNewsFetcher() {
  var currentHour = parseInt(Utilities.formatDate(new Date(), 'Europe/Moscow', 'HH'));
  if (TARGET_HOURS.indexOf(currentHour) !== -1) {
    console.log("Время совпадает. Запускаем...");
    fetchAndSendNews();
  } else {
    console.log("Не время (" + currentHour + ":00 МСК).");
  }
}

function cleanupSentMarkers() {
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys(), deletedCount = 0;
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('SENT_') === 0) { props.deleteProperty(keys[i]); deletedCount++; }
  }
  console.log("Удалено меток: " + deletedCount);
}

function setWebhook() {
  var url = "https://api.telegram.org/bot" + BOT_TOKEN + "/setWebhook?url=" + encodeURIComponent(EXEC_URL) + "&drop_pending_updates=true";
  var res = UrlFetchApp.fetch(url, {method: "post"});
  console.log("✅ Вебхук установлен на: " + EXEC_URL);
  console.log("Ответ Telegram: " + res.getContentText());
}

function checkWebhookStatus() {
  console.log("=== ПРОВЕРКА СТАТУСА ===");
  console.log("Токен бота: ✅ Установлен");
  console.log("Groq API Key: ✅ Установлен");

  var url = "https://api.telegram.org/bot" + BOT_TOKEN + "/getWebhookInfo";
  var res = UrlFetchApp.fetch(url, { method: "get" });
  var data = JSON.parse(res.getContentText());

  if (data.ok) {
    var webhook = data.result;
    console.log("\nURL вебхука в Telegram: " + (webhook.url || "❌ НЕ УСТАНОВЛЕН"));
    console.log("Наш жестко заданный /exec URL: " + EXEC_URL);

    if (webhook.url === EXEC_URL) {
      console.log("\n✅ ИДЕАЛЬНО: URL ВЕБХУКА СОВПАДАЕТ!");
    } else {
      console.log("\n⚠️ ВНИМАНИЕ: URL не совпадает. Запусти функцию setWebhook()");
    }
    console.log("Ожидаемые обновления: " + webhook.pending_update_count);
    console.log("Последняя ошибка: " + (webhook.last_error_message || "✅ Нет ошибок"));
  }
  console.log("\n=== ПРОВЕРКА ЗАВЕРШЕНА ===");
}

function deleteWebhook() {
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/deleteWebhook?drop_pending_updates=true", {method: "post"});
  console.log("Вебхук удалён: " + res.getContentText());
}

function cleanupOldSentMarkers() {
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys();
  var deletedCount = 0;
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('SENT_') === 0) {
      props.deleteProperty(keys[i]);
      deletedCount++;
    }
  }
  console.log("✅ Удалено старых меток SENT_: " + deletedCount);
}