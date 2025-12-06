import {
    SubmitTransaction,
    SettleTransaction
  } from "../generated/Transaction/Transaction";
  import { Ad } from "../generated/schema";
  import { BigInt } from "@graphprotocol/graph-ts";
  
  export function handleSubmitTransaction(event: SubmitTransaction): void {
    // use adId as the entity id
    let id = event.params.adId;
    let ad = Ad.load(id);
  
    if (ad == null) {
      ad = new Ad(id);
      ad.createdAt = event.block.timestamp;
    }
  
    ad.adId = event.params.adId;
    ad.spendLimit = event.params.spendLimit;
    ad.imageUrl = event.params.imageUrl;
    ad.imageSize = event.params.imagesize;
    ad.cta = event.params.cta;
    ad.desc = event.params.desc;
    ad.status = event.params.status;
    ad.personids = event.params.personid;  // string[]
    ad.clickTag = event.params._clickTag;
    ad.publisher = event.params._publisherId;
  
    ad.updatedAt = event.block.timestamp;
  
    ad.save();
  }
  
  export function handleSettleTransaction(event: SettleTransaction): void {
    let id = event.params.adId;
    let ad = Ad.load(id);
  
    if (ad == null) {
      // nothing to update
      return;
    }
  
    // contract sets status false & updates spendLimit on-chain;
    // we at least mirror status here
    ad.status = event.params.status;
    ad.updatedAt = event.block.timestamp;
  
    ad.save();
  }
  