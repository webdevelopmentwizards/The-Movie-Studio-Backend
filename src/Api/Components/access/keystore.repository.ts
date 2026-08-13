import Keystore, { KeystoreModel } from './Keystore';
import type { UsersEntity } from './User';

export default class KeystoreRepo {

  public static findforKey(client: UsersEntity["id"], key: string): Promise<any | null> {
    return KeystoreModel.findFirst({
      where: {
        clientId: client, primaryKey: key,
      }
    })
  }

  public static remove(client: UsersEntity["id"]): Promise<any | null> {
    console.log(client, "client")
    return KeystoreModel.deleteMany({
      where: {
        clientId: client
      }
    });
  }

  public static find(
    client: UsersEntity["id"],
    primaryKey: string,
    secondaryKey: string,
  ): Promise<any | null> {
    return KeystoreModel.findFirst({
      where: {
        clientId: client,
        primaryKey: primaryKey,
        secondaryKey: secondaryKey,
      }
    })
  }

  public static async create(
    client: UsersEntity["id"],
    primaryKey: string,
    secondaryKey: string,
  ): Promise<any> {
    const keystore = await KeystoreModel.create({
      data: {
        clientId: client,
        primaryKey: primaryKey,
        secondaryKey: secondaryKey
      }
    });
    return keystore;
  }
}
