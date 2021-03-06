// deep equals
const isObject = (obj) => typeof obj === "object" && obj !== null;

// TODO does this work on arrays?
const deepEqual = (obj1, obj2) => {
  if (obj1 === obj2) {
    return true;
  }
  if (isObject(obj1) && isObject(obj2)) {
    if (Object.keys(obj1).length !== Object.keys(obj2).length) {
      return false;
    }
    for (var prop in obj1) {
      if (!deepEqual(obj1[prop], obj2[prop])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

const curryToArity = (fn, arity) => {
  const resolver = (...args) => {
    return (...innerArgs) => {
      // make sure the function won't return functions endlessly when called with no arguments
      const newArgs = arity !== 0 && innerArgs.length === 0 ? [undefined] : innerArgs;
      const allArgs = [...args, ...newArgs];
      return allArgs.length >= arity ? fn(...allArgs) : resolver(...allArgs);
    };
  };
  return resolver();
};

const append = (list, val) => [...list, val];

// Union
const unionEquals = function (union = {}) {
  return (
    this._ctor === union._ctor &&
    deepEqual(this._args, union._args)
  );
};

const union = props => {
  const Union = function (ctor, args) {
    this._ctor = ctor;
    this._args = args;
    return this;
  };

  // static
  const tags = Object.keys(props);
  Union._tags = tags;
  tags.forEach(ctor => {
    const arity = props[ctor];
    Union[ctor] = curryToArity((...args) => new Union(ctor, args), arity);
  });

  // prototype
  Union.prototype.equals = unionEquals;
  Union.prototype.__UNION__ = true;

  return Union;
};

// Pattern matching
// TODO handle default case
const matchWith = (union, cases) => {
  const {_ctor: ctor} = union;
  const allIncluded = (arr1, arr2) => {
    return arr1.every(key => arr2.includes(key));
  };
  if (!union.__UNION__) {
    throw new Error('Trying to pattern match a non-union type.');
  }
  if (!allIncluded(Object.keys(cases), union.constructor._tags)) {
    throw new Error('There are not enough branches for all possibilities.');
  }
  if (!allIncluded(union.constructor._tags, Object.keys(cases))) {
    throw new Error('There are unrecognized patters in some branches.');
  }
  if (!(ctor in cases) || typeof cases[ctor] !== 'function') {
    throw new Error(`The constructor ${ctor} is not a function.`);
  }
  return cases[ctor](...union._args);
};

// Maybe
const Maybe = union({
  Just: 1,
  Nothing: 0,
});

Maybe.of = Maybe.Just;

Maybe.prototype.map = function (func) {
  return matchWith(this, {
    Just: val => Maybe.Just(func(val)),
    Nothing: () => this,
  });
};

Maybe.prototype.chain = function (func) {
  return matchWith(this, {
    Just: func,
    Nothing: () => this,
  });
};

Maybe.prototype.ap = function (maybeVal) {
  return matchWith(this, {
    Just: func => maybeVal.map(func),
    Nothing: () => this,
  });
};

// Result
const Result = union({
  Err: 1,
  Ok: 1,
});

Result.of = Result.Ok;

Result.prototype.map = function (func) {
  return matchWith(this, {
    Err: () => this,
    Ok: val => Result.Ok(func(val)),
  });
};

Result.prototype.mapError = function (func) {
  return matchWith(this, {
    Err: val => Result.Err(func(val)),
    Ok: () => this,
  });
};

Result.prototype.chain = function (func) {
  return matchWith(this, {
    Err: () => this,
    Ok: func,
  });
};

Result.prototype.ap = function (resultVal) {
  return matchWith(this, {
    Err: () => this,
    Ok: (func) => resultVal.map(func),
  });
};

// Task
const Task = function (f, args = []) {
  this._func = f;
  this._args = args;
};

Task.of = (...args) => {
  return new Task(...args);
};

Task.succeed = val => {
  return new Task(() => Promise.resolve(val));
};

Task.fail = err => {
  return new Task(() => Promise.reject(err));
};

// Batching Tasks
// concurrently
Task.all = taskList => {
  return new Task(() => {
    const promises = taskList.map(task => task.run());
    return Promise.all(promises);
  });
};

// sequentially (convenience wrapper for a chained task)
Task.sequence = taskList =>
  taskList.reduce((acc, task) => acc.map2(append, task), Task.succeed([]));

// should never be called manually (only by the calling program)
Task.prototype.run = function () {
  return Promise.resolve(this._func(...this._args));
};

Task.prototype.map = function (func) {
  const newFunc = () => this.run().then(func);
  return new Task(newFunc);
};

Task.prototype.map2 = function (func, task) {
  const newFunc = () =>
    this.run().then(val1 => task.run().then(val2 => func(val1, val2)));
  return new Task(newFunc);
};

Task.prototype.mapError = function (func) {
  const newFunc = () => this.run().catch(err => Promise.reject(func(err)));
  return new Task(newFunc);
};

Task.prototype.chain = function (func) {
  const newFunc = () => this.run().then(val => func(val).run());
  return new Task(newFunc);
};

Task.prototype.onError = function (func) {
  const newFunc = () => this.run().catch(err => func(err).run());
  return new Task(newFunc);
};

export {
  union,
  matchWith,
  Maybe,
  Result,
  Task,
};
