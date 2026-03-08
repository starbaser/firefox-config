const ctx = {};
tri.ctx = ctx;

tri.ctx.init = ({ background = false } = {}) => {
  console.log("init", background);
};

tri.ctx.init();

tri.nativekey = function () {
  console.log("nativekey");
};
