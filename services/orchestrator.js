import { UberMockAPI } from './uber-mock';
import { OpenTableMockAPI } from './opentable-mock';
import { CalendarMockAPI } from './calendar-mock';

export class ServiceOrchestrator {
  static async executeAction(action) {
    switch (action.service.toLowerCase()) {
      case 'uber':
        if (action.action === 'request_pickup') {
          return await UberMockAPI.requestRide(action.params);
        }
        break;
        
      case 'opentable':
        if (action.action === 'create_reservation') {
          return await OpenTableMockAPI.makeReservation(action.params);
        }
        break;
        
      case 'calendar':
        if (action.action === 'create_event') {
          return await CalendarMockAPI.createEvent(action.params);
        }
        break;
        
      default:
        throw new Error(`Unknown service: ${action.service}`);
    }
  }

  static async executePlan(actions) {
    const results = [];
    
    for (const action of actions) {
      try {
        const result = await this.executeAction(action);
        results.push({
          action,
          result,
          status: 'success'
        });
      } catch (error) {
        results.push({
          action,
          error: error.message,
          status: 'error'
        });
      }
    }
    
    return results;
  }
}