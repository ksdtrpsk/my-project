// Only errors explicitly created by the application may expose their messages.
class HttpError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
function problem(status,message){return new HttpError(status,message);}
function publicError(error){
  return error instanceof HttpError && Number.isInteger(error.status) && error.status>=400 && error.status<=599
    ? {status:error.status,message:error.message}
    : {status:503,message:'ติดต่อระบบไม่ได้ กรุณาลองใหม่ภายหลัง'};
}
module.exports={problem,publicError};
