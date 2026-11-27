import {describe,expect,it} from 'vitest';
import {shouldRequestPermission} from './permission-ask';

describe('permission ask decision',()=>{
  it('asks when the permission is still undecided and nothing was asked before',()=>{
    expect(shouldRequestPermission({permission:'default',asked:false})).toBe(true);
  });
  it('never asks again automatically after the first ask',()=>{
    expect(shouldRequestPermission({permission:'default',asked:true})).toBe(false);
  });
  it('lets an explicit button ask again',()=>{
    expect(shouldRequestPermission({permission:'default',asked:true,force:true})).toBe(true);
  });
  it('respects ask=false even when forced',()=>{
    expect(shouldRequestPermission({permission:'default',asked:false,ask:false,force:true})).toBe(false);
  });
  it('never re-asks once granted, denied or unsupported',()=>{
    for(const permission of ['granted','denied','unsupported'] as const){
      expect(shouldRequestPermission({permission,asked:false,force:true}),permission).toBe(false);
    }
  });
});
