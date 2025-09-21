const { AppError, asyncHandler } = require('../middleware/errorHandler');
const translationService = require('../services/translationService');
const contentstackService = require('../services/contentstackService');

const translateText = asyncHandler(async (req, res) => {
  const { content, targetLanguage, sourceLanguage } = req.body;

  if (!content) {
    throw new AppError('Content is required', 400);
  }

  if (!targetLanguage) {
    throw new AppError('Target language is required', 400);
  }

  const translatedText = await translationService.translateContent(
    content, 
    targetLanguage, 
    sourceLanguage
  );

  res.json({
    success: true,
    originalContent: content,
    translatedContent: translatedText,
    targetLanguage,
    sourceLanguage: sourceLanguage || 'auto'
  });
});
const translateEntry = asyncHandler(async (req, res) => {
  const { entryUid, targetLanguage, fieldsToTranslate } = req.body;
  const stackApiKey = req.stackApiKey;

  if (!entryUid) {
    throw new AppError('Entry UID is required', 400);
  }

  if (!targetLanguage) {
    throw new AppError('Target language is required', 400);
  }

  const entry = await contentstackService.fetchEntryByUid(entryUid, null, stackApiKey);
  
  if (!entry) {
    throw new AppError('Entry not found', 404);
  }

  const translationResult = await translationService.translateEntry(
    entry,
    targetLanguage,
    fieldsToTranslate
  );

  res.json({
    success: true,
    entryUid,
    ...translationResult
  });
});


const getSupportedLanguages = asyncHandler(async (req, res) => {
  const languages = translationService.getSupportedLanguages();

  res.json({
    success: true,
    languages,
    total: languages.length
  });
});


const translateEntryFields = asyncHandler(async (req, res) => {
  const { entryData, targetLanguage, fieldsToTranslate } = req.body;

  if (!entryData) {
    throw new AppError('Entry data is required', 400);
  }

  if (!targetLanguage) {
    throw new AppError('Target language is required', 400);
  }

  const translationResult = await translationService.translateEntry(
    entryData,
    targetLanguage,
    fieldsToTranslate
  );

  res.json({
    success: true,
    ...translationResult
  });
});


module.exports = {
  translateText,
  translateEntry,
  translateEntryFields,
  getSupportedLanguages,
};
