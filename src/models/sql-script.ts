export type SQLScriptId = string & { readonly _: unique symbol };

export type SQLScript = {
  id: SQLScriptId;
  /**
   * The name of the SQL script without extension.
   *
   * Extentsion is always implied to be `.sql`.
   */
  name: string;
  content: string;
};
