const axios = require('axios');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');

const translateContent = async (content, targetLanguage, sourceLanguage = 'auto') => {
  if (!content || typeof content !== 'string') {
    throw new AppError('Content must be a non-empty string', 400);
  }

  if (!targetLanguage) {
    throw new AppError('Target language is required', 400);
  }

  try {
    return await translateWithGemini(content, targetLanguage);
  } catch (error) {
    console.error('Gemini translation failed:', error.message);
    throw new AppError('Translation service unavailable', 503);
  }
};

const translateWithGemini = async (content, targetLanguage) => {
  if (!config.apis.gemini?.apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
    {
      contents: [{
        parts: [{
          text: `Please translate the following text from English to ${getLanguageName(targetLanguage)}. Return only the translated text without any additional explanations:\n\n${content}`
        }]
      }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': config.apis.gemini.apiKey
      },
      timeout: 30000,
    }
  );

  const translatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!translatedText) {
    throw new Error('Invalid translation response from Gemini API');
  }
  return translatedText.trim();
};

const getLanguageName = (code) => {
  const languageMap = {
    'es': 'Spanish',
    'fr': 'French', 
    'de': 'German',
    'zh': 'Chinese (Simplified)',
    'hi': 'Hindi'
  };
  return languageMap[code] || code;
};

const translateEntry = async (entry, targetLanguage, fieldsToTranslate = []) => {
  if (!entry || typeof entry !== 'object') {
    throw new AppError('Entry must be a valid object', 400);
  }

  try {
    const translations = {};

    const fields = fieldsToTranslate.length > 0 ? fieldsToTranslate : findTextFields(entry);

    for (const field of fields) {
      const fieldValue = getNestedValue(entry, field);
      
      if (fieldValue && typeof fieldValue === 'string' && fieldValue.trim().length > 10) {
        try {
          const translatedText = await translateContent(fieldValue, targetLanguage);
          translations[field] = translatedText;
        } catch (error) {
          translations[field] = fieldValue;
        }
      }
    }

    return {
      originalEntry: entry,
      translatedFields: translations,
      targetLanguage,
      translatedAt: new Date().toISOString()
    };

  } catch (error) {
    throw new AppError(`Failed to translate entry: ${error.message}`, 500);
  }
};

const findTextFields = (obj, prefix = '') => {
  const textFields = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    
    if (isSystemField(key)) continue;
    
    if (typeof value === 'string' && value.trim().length > 10) {
      textFields.push(fieldPath);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      textFields.push(...findTextFields(value, fieldPath));
    }
  }
  
  return textFields;
};

const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

const isSystemField = (fieldName) => {
  const systemFields = [
    'uid', '_version', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'publish_details', 'ACL', '_in_progress', 'locale', 'tags', 'score',
    'similarity', 'rerankScore', 'contentType', 'environment'
  ];
  return systemFields.includes(fieldName);
};

const getSupportedLanguages = () => {
  return [
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'hi', name: 'Hindi' },
    { code: 'zh', name: 'Chinese (Simplified)' }
  ];
};

module.exports = {
  translateContent,
  translateEntry,
  getSupportedLanguages
};