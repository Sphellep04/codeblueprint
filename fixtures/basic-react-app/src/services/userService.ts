export class UserService {
  getUser(id: string): string {
    return `user-${id}`;
  }
}

export function loadUser(service: UserService, id: string): string {
  return service.getUser(id);
}
