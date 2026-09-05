// Format respons API yang standar
const response = {
  // Respons sukses
  success: (res, data = {}, message = 'Sukses') => {
    return res.status(200).json({
      success: true,
      message,
      data,
      error: null
    });
  },
  
  // Respons gagal/error
  error: (res, message = 'Terjadi kesalahan', statusCode = 500, errorDetails = null) => {
    return res.status(statusCode).json({
      success: false,
      message,
      data: null,
      error: errorDetails || message
    });
  }
};

module.exports = response;
