
const createAppError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  error.isOperational = true;
  Error.captureStackTrace(error, createAppError);
  return error;
};

function AppError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  error.isOperational = true;
  Error.captureStackTrace(error, AppError);
  return error;
}

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = createAppError(message, 404);
  }

  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = createAppError(message, 400);
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = createAppError(message, 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error'
  });
};

const notFound = (req, res, next) => {
  const error = createAppError(`Not found - ${req.originalUrl}`, 404);
  next(error);
};

module.exports = {
  AppError,
  createAppError,
  asyncHandler,
  errorHandler,
  notFound,
};
