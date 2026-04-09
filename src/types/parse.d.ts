// src/types/parse.d.ts
declare module "parse" {
  /** Base Parse Object */
  export class Object {
    constructor(className?: string);
    get(attr: string): any;
    set(attr: string, value: any): void;
    save(attrs?: Record<string, any>): Promise<this>;
    destroy(): Promise<void>;
    id: string;
  }

  /** Parse Query for objects */
  export class Query<T extends Object = Object> {
    constructor(cls: new () => T | string);
    limit(n: number): this;
    find(): Promise<T[]>;
    equalTo(attr: string, value: any): this;
    ascending(attr: string): this;
    descending(attr: string): this;
    first(): Promise<T | null>;
  }

  /** You can extend this with any Parse members you use */
  export class User extends Object {
    static current(): User | null;
    static logIn(username: string, password: string): Promise<User>;
    static logOut(): Promise<void>;
    getUsername(): string;
  }

  /** Main Parse namespace */
  const Parse: {
    Object: typeof Object;
    Query: typeof Query;
    User: typeof User;
    // Add other members you use like Cloud, File, etc.
    initialize(appId: string, jsKey?: string): void;
    serverURL: string;
  };

  export default Parse;
}