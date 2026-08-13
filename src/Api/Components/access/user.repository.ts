import type { UsersEntity } from './User';
import { UsersModel } from './User';
import { Prisma, RoleName } from '@prisma/client';
import Role from '../roles/Role';
import RoleRepo from "../roles/role.repository"
import { BadRequestError, InternalError } from '../../../core/ApiError';
import bcrypt from 'bcrypt';
import Logger from '../../../core/Logger'

type UsersWhereInput = Prisma.UsersWhereInput;
type UsersOrderByWithRelationInput = Prisma.UsersOrderByWithRelationInput;
type UsersUpdateInput = Prisma.UsersUpdateInput;
type UsersUncheckedUpdateInput = Prisma.UsersUncheckedUpdateInput;

export default class UserRepo {

  public static find({ where }: { where: UsersWhereInput }) {

    return UsersModel.findMany({
      where,
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      }
    })
  }

  public static findMany({ where, orderBy }: { where: UsersWhereInput, orderBy: UsersOrderByWithRelationInput }) {
    return UsersModel.findMany({
      where,
      orderBy
    })
  }

  public static findOne({ where }: { where: UsersWhereInput }) {
    return UsersModel.findFirst({
      where,
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      }
    })
  }



  public static findUsers(): Promise<UsersEntity[] | null> {
    return UsersModel.findMany({
      where: {
        role: { code: "USER" },
      },
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  public static async findbyIdAndUpdate(id: string, data: any): Promise<UsersEntity | null> {
    // data.password = data.password ? bcrypt.hashSync(data.password, 10) : "";

    const updateData: UsersUpdateInput = {};

    if (typeof data.email !== 'undefined') {
      updateData.email = data.email;
    }

    if (typeof data.firstName !== 'undefined') {
      updateData.firstName = data.firstName;
    }

    if (typeof data.lastName !== 'undefined') {
      updateData.lastName = data.lastName;
    }

    if (typeof data.phoneNumber !== 'undefined') {
      updateData.phoneNumber = data.phoneNumber;
    }

    if (typeof data.profileImage !== 'undefined') {
      updateData.profileImage = data.profileImage;
    }

    if (typeof data.provider !== 'undefined') {
      // @ts-ignore
      updateData.provider = data.provider;
    }

    if (typeof (data as any).oauthUid !== 'undefined') {
      // @ts-ignore
      updateData.oauthUid = (data as any).oauthUid;
    }

    return UsersModel.update({
      where: { id },
      data: updateData,
      include: {
        role: {
          select: {
            id: true,
            code: true
          },
        }
      }
    });
  }
 


  public static findById(id: string) {
    return UsersModel.findUnique({
      where: { id },
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      },
    })
  }

  public static async findByEmail(email: string) {
    const user = await UsersModel.findUnique({
      where: { email },
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      }
    });
    return user
  }

  public static async create(
    user: UsersEntity,
    roleCode: Role['code'],
  ): Promise<{ user: UsersEntity | null }> {
    const now = new Date();
    const role = await RoleRepo.findByCode(roleCode)
    if (!role) throw new InternalError('Role must be defined in db!');
    user.password = user.password ? bcrypt.hashSync(user.password, 10) : "";
    user.roleId = role.id;
    user.createdAt = user.updatedAt = now;

    const createdUser = await UsersModel.create({
      data: {
        email: user.email,
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        roleId: role.id,
        provider: user.provider ?? 'EMAIL',
        oauthUid: (user as any).oauthUid ?? null,
      } as any,
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      }
    })
    const { password, ...userWithoutPassword } = createdUser;
    return { user: userWithoutPassword as any };
  }

  public static async createUser(user: UsersEntity): Promise<{ user: UsersEntity | null }> {
    const now = new Date();

    // @ts-ignore 
    const role = await RoleRepo.findByCode(user.role)
    if (!role) throw new InternalError('Role must be defined in db!');

    user.password = bcrypt.hashSync(user.password || "NotPossible", 10);
    user.roleId = role.id;
    user.createdAt = user.updatedAt = now;
    // @ts-ignore 
    delete user.role

    // @ts-ignore
    user.provider = user.provider ?? 'EMAIL';

    const createdUser = await UsersModel.create({
      data: {
        ...user,
        roleId: role.id,   // ✅ sirf roleId bhejo
      },
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        },
      }
    });

    return { user: createdUser };

  }

  public static async update(id: UsersEntity['id'], user: UsersUncheckedUpdateInput) {

    // @ts-ignore
    if (user.role) {
      // @ts-ignore
      const role = await RoleRepo.findByCode(user.role)
      if (!role) throw new InternalError('Role must be defined in db!');
      user.roleId = role.id;
    }

    if (user.password) {
      //@ts-expect-error
      if (user.password?.length < 6) {
        throw new BadRequestError("Password must be at least 6 characters")
      }
      //@ts-expect-error
      user.password = bcrypt.hashSync(user.password || "NotPossible", 10);
      Logger.info(`user (${user.email}) password update`)
    } else {
      // @ts-ignore 
      delete user.password
    }

    // @ts-ignore 
    delete user.role
    // @ts-ignore 
    delete user.company

    return UsersModel.update({
      where: { id },
      // @ts-ignore
      data: { ...user },
      include: {
        role: {
          select: {
            id: true,
            code: true
          },
        },
      }
    })
  }

  public static async hardDelete(id: UsersEntity['id']) {
    return UsersModel.delete({
      where: { id },
    });
  }





  public static async changePassword(id: UsersEntity['id'], password: string): Promise<UsersEntity | null> {
    return UsersModel.update({
      where: { id },
      data: {
        password
      },

      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      }
    })
  }


  public static count() {
    return UsersModel.count();
  }
  public static async updatePassword(id: UsersEntity['id'], { password }: { password: UsersEntity['password'] }): Promise<UsersEntity | null> {

    password = bcrypt.hashSync(password || "NotPossible", 10);
    Logger.info(`user (${id}) password update`)

    return UsersModel.update({
      where: { id },
      data: {
        password
      },
    })
  }

  public static async markEmailAsVerified(id: UsersEntity['id']): Promise<UsersEntity | null> {
    return UsersModel.update({
      where: { id },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      },
      include: {
        role: {
          select: {
            id: true,
            code: true
          }
        }
      }
    })
  }

  public static async setActiveStatus(id: UsersEntity['id'], status: boolean): Promise<UsersEntity | null> {
    return UsersModel.update({
      where: { id },
      data: {
        // @ts-ignore
        isActive: status
      },
    })
  }

  public static async findAll(
    where: UsersWhereInput = {},
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      UsersModel.findMany({
        where: {
          ...where,
        },
        include: {
          role: {
            select: {
              id: true,
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      UsersModel.count({
        where: {
          ...where,
        },
      }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Count users by role and date range
   */
  public static async countUsersByRoleAndDateRange(
    roleCode: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    return UsersModel.count({
      where: {
        isDeleted: false,
        role: {
          code: roleCode as RoleName,
        },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }
}